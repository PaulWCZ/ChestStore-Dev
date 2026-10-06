import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { AppError, createApp, log, page, publicPage, type PageContext, type View } from "@argentic/chest-app";
import { seenIn } from "@argentic/chest-app/db";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import * as schedules from "@argentic/chest-sdk/schedules";
import { actions } from "./actions.ts";
import { format, localeOf, locales, words, type Catalogue } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { receiptObject, sectionCounts } from "./lib/expenses.ts";
import { exportCsv, exportZip, selectionOf } from "./lib/export.ts";
import { cleanup, reminder } from "./lib/jobs.ts";
import { journalText } from "./lib/journal.ts";
import { handlers } from "./lib/lifecycle.ts";
import { thumbnailTypes } from "./shared/model.ts";
import { runFile } from "./lib/payments.ts";
import { vehicleProofObject } from "./lib/settings.ts";
import { approvePage } from "./pages/Approve.tsx";
import { cardsPage } from "./pages/Cards.tsx";
import { companySettingsPage } from "./pages/CompanySettings.tsx";
import { editPage, newPage } from "./pages/Compose.tsx";
import { expensePage } from "./pages/Expense.tsx";
import { exportPage } from "./pages/Export.tsx";
import { homePage } from "./pages/Home.tsx";
import { mySettingsPage } from "./pages/MySettings.tsx";
import { payPage } from "./pages/Pay.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { searchPage } from "./pages/Search.tsx";
import { pageLook } from "./theme.ts";

// Expenses' routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name>, the look the company chose as
// a stylesheet (/chest/look.css; /look.css outside /chest), the member of
// every /chest request (401 without), /lang/<code>, the error pages, and
// answers 404 to anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => pageLook(viewer.member !== null),
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// A page of Expenses: a member whose role gives nothing sees why (the
// layout's NoAccess) and the page reads nothing; for the others, the
// numbers of the sections' tabs (what waits for them), for the layout.
const expenses = (render: (p: PageContext) => Promise<View>) => page(async p => {
  if (!roleOf(p.member)) return { title: p.t.noAccess.title, body: null };
  const [view, counts] = await Promise.all([render(p), sectionCounts(db(), p.member)]);
  return { ...view, layout: { counts } };
});

// ---- The members' part (/chest…).
// My expenses: to send, waiting, approved, paid back.
app.get("/chest", expenses(homePage));
// Add an expense (?trip=1 a car trip, ?allowance=1 a flat rate).
app.get("/chest/new", expenses(newPage));
// One expense, and its edit screen (its owner, while a draft).
app.get("/chest/expenses/:id", expenses(expensePage));
app.get("/chest/expenses/:id/edit", expenses(editPage));
// To approve (approvers, accountants).
app.get("/chest/approve", expenses(approvePage));
// Search what the reader may see.
app.get("/chest/search", expenses(searchPage));
// To pay back, and the company cards (accountants).
app.get("/chest/pay", expenses(payPage));
app.get("/chest/cards", expenses(cardsPage));
// The monthly export (accountants).
app.get("/chest/export", expenses(exportPage));
// Settings: one's own; the company's (accountants).
app.get("/chest/settings", expenses(mySettingsPage));
app.get("/chest/settings/company", expenses(companySettingsPage));

// ---- Downloads and files. Each reads the member the Chest asserted (the
// package refused the request without one) and answers a refusal in the
// reader's words, as text.
const viewerOf = (c: { get(key: "viewer"): { member: Member; t: Catalogue; locale: string } }) => c.get("viewer");

// An expense's receipt, for whoever may see the expense: a fresh 15-minute
// link signed by the Chest (never kept in a page). ?size=256 or 1024 asks
// for the Chest's thumbnail of a photo; ?download to save it.
app.get("/chest/receipts/:id", async c => {
  try {
    const receipt = await receiptObject(db(), viewerOf(c).member, c.req.param("id"));
    const size = c.req.query("size");
    const thumbnail = (size === "256" || size === "1024") && thumbnailTypes.includes(receipt.type) ? (Number(size) as 256 | 1024) : undefined;
    if (size && thumbnail === undefined) return c.body(null, 404, { "Cache-Control": "no-store" });
    const { url } = await files.url(receipt.object, { ...(thumbnail ? { thumbnail } : {}), ...(c.req.query("download") !== undefined ? { download: true } : {}) });
    return c.body(null, 303, { Location: url, "Cache-Control": "private, max-age=600" });
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    if (error instanceof ChestError) return c.body(null, error.code === "not_found" || error.code === "no_thumbnail" ? 404 : 503);
    throw error;
  }
});

// A vehicle's registration certificate, for its owner and the accountants.
app.get("/chest/vehicles/:member/proof", async c => {
  try {
    const proof = await vehicleProofObject(db(), viewerOf(c).member, c.req.param("member"));
    const { url } = await files.url(proof.object);
    return c.body(null, 303, { Location: url, "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof AppError) return c.body(null, 404);
    if (error instanceof ChestError) return c.body(null, error.code === "not_found" ? 404 : 503);
    throw error;
  }
});

// A batch's transfer file (pain.001.001.03 XML), for the accountants: the
// same file each time, to upload to the company's bank.
app.get("/chest/pay/files/:id", async c => {
  const { member, t } = viewerOf(c);
  try {
    const file = await runFile(db(), member, c.req.param("id"));
    return download(file.xml, "application/xml; charset=utf-8", file.fileName);
  } catch (error) {
    return refusal(error, t);
  }
});

// The month's spreadsheet, accounting entries and receipts (accountants):
// ?month=YYYY-MM[&person=mbr_…][&by=paid], in the reader's language.
app.get("/chest/export/csv", async c => {
  const { member, t, locale } = viewerOf(c);
  try {
    const { text, fileName } = await exportCsv(db(), member, localeOf(locale), selectionOf(new URL(c.req.url).searchParams));
    return download(text, "text/csv; charset=utf-8", fileName);
  } catch (error) {
    return refusal(error, t);
  }
});
app.get("/chest/export/journal", async c => {
  const { member, t, locale } = viewerOf(c);
  try {
    const { text, fileName } = await journalText(db(), member, localeOf(locale), selectionOf(new URL(c.req.url).searchParams));
    return download(text, "text/plain; charset=utf-8", fileName);
  } catch (error) {
    return refusal(error, t);
  }
});
// The ZIP is written while it is sent, one receipt of the Chest in memory
// at a time (10 MiB at most each; 5,000 receipts and 1 GiB per archive at
// most, src/shared/model.ts): who asks and what is in it are checked before the
// first byte; a failure halfway cuts the download (the browser says it
// failed) and is logged.
app.get("/chest/export/zip", async c => {
  const { member, t, locale } = viewerOf(c);
  try {
    const { stream, fileName } = await exportZip(db(), member, localeOf(locale), selectionOf(new URL(c.req.url).searchParams));
    return new Response(stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(fileName), "Cache-Control": "private, no-store" } });
  } catch (error) {
    return refusal(error, t);
  }
});

// The receipt reader's files (tesseract.js: its worker, core and French
// model, copied into dist/ocr by scripts/ocr-assets.mjs), for the members'
// browsers. They are answered with a policy of their own: the worker
// compiles WebAssembly ('wasm-unsafe-eval'), which the pages' policy
// forbids — a worker obeys the policy its own script comes with, so the
// pages keep theirs. Members only (under /chest), never a page.
const ocrFiles: Record<string, string> = {
  "worker.min.js": "text/javascript; charset=utf-8",
  "tesseract-core-simd-lstm.wasm.js": "text/javascript; charset=utf-8",
  "fra.traineddata.gz": "application/octet-stream",
};
const ocrPolicy = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors 'none'";
app.get("/chest/ocr/:file", c => {
  const name = c.req.param("file");
  const type = Object.hasOwn(ocrFiles, name) ? ocrFiles[name] : undefined;
  const path = join("dist", "ocr", name);
  let size: number;
  try {
    if (!type) throw new Error("not an OCR file");
    size = statSync(path).size;
  } catch {
    return c.body(null, 404);
  }
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(size), "Content-Security-Policy": ocrPolicy, "Cache-Control": "private, max-age=86400" } });
});

// ---- The host's root: Expenses has no public part (a Chest answers 404
// on its public host); reached without a Chest, it says where Expenses
// lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (never read the body before
// handle()): the members' lifecycle ("receives" in chest.json:
// src/lib/lifecycle.ts) and the runs of chest.json's "schedules" (the 25th's
// reminder, the nightly cleanup: src/lib/jobs.ts). A handler that throws
// makes the Chest send it again: they are idempotent. The ids already
// handled (events and runs alike) are kept in chest_events
// (migrations/0001_expenses.sql); the nightly cleanup forgets those older
// than 30 days.
const handled = seenIn("chest_events");
app.post("/chest-events", async c => new Response(null, { status: await events.handle(c.req.raw, handlers(db()), { seen: handled }) }));
app.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {
    reminder: async run => {
      const reminded = await reminder(db(), run);
      log.info("reminder", { people: reminded });
    },
    cleanup: async run => {
      const done = await cleanup(db(), run);
      await handled.forget();
      log.info("cleanup", { uploads: done.uploads, drafts: done.drafts });
    },
  }, { seen: handled }),
}));

// ---- Helpers of the routes above.

// A download's name, ASCII only (the words are in the file).
function attachment(fileName: string): string {
  return `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, "_")}"`;
}

// A file to download, kept by no cache.
function download(body: string, type: string, name: string): Response {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": attachment(name), "Cache-Control": "private, no-store" } });
}

// What a download refuses, in the reader's words, with its status; the
// Chest unreachable is 503; anything else is a failure the package logs.
function refusal(error: unknown, t: Catalogue): Response {
  const text = (status: number, words: string) => new Response(words, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  if (error instanceof AppError) {
    const words = t.errors[error.code as keyof Catalogue["errors"]] ?? t.errors.invalid;
    return text(error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400, format(words, error.values));
  }
  if (error instanceof TooLarge) return text(413, format(t.errors.file_too_large, { max: 10 }));
  if (error instanceof ChestError) return text(503, t.errors.unavailable);
  throw error;
}

