import { chest } from "@argentic/chest-sdk/chest";
import { createApp, download, fail, page, publicPage, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { can, roleOf } from "./lib/access.ts";
import { pdfOf } from "./lib/archive.ts";
import { company } from "./lib/company.ts";
import { db } from "./lib/db.ts";
import { chestEvents, chestSchedules } from "./lib/deliveries.ts";
import { getDocument, overdueCount } from "./lib/documents.ts";
import { disposition, linkGuard, publicFile } from "./lib/downloads.ts";
import { clientsCsv, exportCsv, exportZip, itemsCsv, period } from "./lib/export.ts";
import { exportJournal } from "./lib/journal.ts";
import { openArchive } from "./lib/monthly.ts";
import { answerPdf, keptPdf, openLink, shownPdf } from "./lib/online.ts";
import { pdfFileName } from "./pdf/document.ts";
import { termsFile, termsFileName } from "./lib/terms.ts";
import { versionPdf } from "./lib/versions.ts";
import { answerPage } from "./pages/Answer.tsx";
import { bankPage } from "./pages/Bank.tsx";
import { cataloguePage } from "./pages/Catalogue.tsx";
import { clientPage } from "./pages/Client.tsx";
import { clientsPage } from "./pages/Clients.tsx";
import { deskPage } from "./pages/Desk.tsx";
import { documentPage } from "./pages/Document.tsx";
import { exportPage } from "./pages/Export.tsx";
import { importPage } from "./pages/Import.tsx";
import { invoicesPage, quotesPage } from "./pages/List.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { sheetOf } from "./theme.ts";
import * as files from "@argentic/chest-sdk/files";
import { ChestError } from "@argentic/chest-sdk/errors";

// Quotes' routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the
// member of every /chest request (401 without), the look as a stylesheet
// of its own (/chest/look.css for the team, /look.css for the public
// pages: src/theme.ts), /lang/<code>, the error pages, and answers 404 to
// anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: async viewer => {
    const sheet = await sheetOf(viewer.member ? "team" : "public");
    return { css: sheet.css, colors: sheet.colors, logo: sheet.look.logo ?? null };
  },
  // The tool's icon; no search engine indexes a page of it.
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The team's part (/chest…). Every page tells the layout the count on
// the Invoices tab (the overdue invoices: a true count, read with the
// page). A member whose role gives nothing gets the layout's "no access"
// (the page reads nothing).
const team = (render: (ctx: PageContext<MemberContext>) => Promise<View> | View) => page(async ctx => {
  if (!roleOf(ctx.member)) return { title: ctx.t.noAccess.title, body: null };
  const view = await render(ctx);
  return { ...view, layout: { ...view.layout, overdue: await overdueCount(db(), chest.today()) } };
});

app.get("/chest", team(deskPage));
app.get("/chest/quotes", team(quotesPage));
app.get("/chest/invoices", team(invoicesPage));
app.get("/chest/documents/:id", team(documentPage));
app.get("/chest/clients", team(clientsPage));
app.get("/chest/clients/:id", team(clientPage));
app.get("/chest/catalogue", team(cataloguePage));
app.get("/chest/export", team(exportPage));
app.get("/chest/import", team(importPage));
app.get("/chest/bank", team(bankPage));
app.get("/chest/settings", team(settingsPage));

// ---- The team's files: download() sends each as a file, never cached; a
// refusal is a page in the reader's words (403, 404, 400). A link to one
// carries `download` (or opens it in a new tab): the browser asks once.
const pdf = (bytes: Uint8Array, name: string, inline: boolean) => new Response(Buffer.from(bytes), {
  headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition(inline ? "inline" : "attachment", name), "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'", "X-Content-Type-Options": "nosniff" },
});

// A document's PDF: an issued invoice or credit note as it was kept, a
// quote or a draft drawn now. Opened in the browser; ?download to save it.
app.get("/chest/documents/:id/pdf", download(async ({ member, param, query }) => {
  const { bytes, fileName } = await pdfOf(db(), member, param("id"), chest.today());
  return pdf(bytes, fileName, query("download") === undefined);
}));

// The exact PDF a client answered on (the proof kept with the answer).
app.get("/chest/documents/:id/answers/:answer", download(async ({ member, param }) => {
  const found = await answerPdf(db(), member, param("answer"));
  if (found.documentId !== param("id")) fail("not_found");
  return pdf(found.bytes, `answer-${found.number ?? param("answer")}.pdf`, false);
}));

// The PDF of a quote's earlier version, as its client was shown it.
app.get("/chest/documents/:id/versions/:version", download(async ({ member, param }) => {
  const full = await getDocument(db(), member, param("id"), chest.today());
  if (full.type !== "quote") fail("not_found");
  const found = await versionPdf(db(), full.id, param("version"));
  return pdf(found.bytes, `${found.number}-v${found.version}.pdf`, false);
}));

// The accountant's export of a period (?from=&to=): the summary, the
// accounting entries, everything as a ZIP written as it is read.
app.get("/chest/export/csv", download(async ({ member, locale, query }) => {
  const { text, fileName } = await exportCsv(db(), member, localeOf(locale), period(query("from"), query("to")), chest.today());
  return { name: fileName, type: "text/csv; charset=utf-8", body: text };
}));
app.get("/chest/export/journal", download(async ({ member, locale, query }) => {
  const { text, fileName } = await exportJournal(db(), member, localeOf(locale), period(query("from"), query("to")));
  return { name: fileName, type: "text/csv; charset=utf-8", body: text };
}));
app.get("/chest/export/zip", download(async ({ member, locale, query }) => {
  const { stream, fileName } = await exportZip(db(), member, localeOf(locale), period(query("from"), query("to")), chest.today(), chest.currency);
  return { name: fileName, type: "application/zip", body: stream };
}));
// The clients or the catalogue, with the importer's column names.
app.get("/chest/export/lists/:name", download(async ({ member, locale, t, param }) => {
  const name = param("name");
  if (name !== "clients" && name !== "items") fail("not_found");
  const text = name === "clients" ? await clientsCsv(db(), member, localeOf(locale)) : await itemsCsv(db(), member, localeOf(locale), chest.currency);
  return { name: (name === "clients" ? t.csv.clientsFile : t.csv.itemsFile) + ".csv", type: "text/csv; charset=utf-8", body: text };
}));
// One month's archive (?part= when it was cut into parts), as it was kept
// in the Chest's files; the desk stops asking once a copy left.
app.get("/chest/export/archives/:period", download(async ({ member, param, query }) => {
  const { bytes, fileName } = await openArchive(db(), member, param("period"), query("part") ?? "1");
  return { name: fileName, type: "application/zip", body: Buffer.from(bytes) };
}));

// The company's logo, for the pages that show the letterhead: a fresh
// 15-minute link the Chest signs.
app.get("/chest/logo", async c => {
  const { member } = c.get("viewer");
  if (!can(member, "read")) return c.body(null, 403);
  try {
    const { logo } = await company(db());
    if (!logo) return c.body(null, 404, { "Cache-Control": "no-store" });
    const { url } = await files.url(logo);
    return c.body(null, 303, { Location: url, "Cache-Control": "private, max-age=600" });
  } catch (error) {
    if (error instanceof ChestError) return c.body(null, error.code === "not_found" ? 404 : 503);
    throw error;
  }
});

// The company's terms and conditions of sale, as quotes carry them.
app.get("/chest/terms", download(async ({ member, locale }) => {
  if (!can(member, "read")) fail("forbidden");
  const terms = await termsFile(db());
  if (!terms) fail("not_found");
  return { name: termsFileName(localeOf(locale)), type: "application/pdf", body: Buffer.from(terms!.bytes) };
}));

// ---- The public part ("public": true): nothing listed, nothing without a
// quote's secret link.
app.get("/", publicPage(publicHome));
app.get("/q/:secret", publicPage(answerPage));

// The quote's PDF for the client who holds its link: the very file their
// answer was given on once they answered, otherwise the one the page shows
// now; ?version=<n> an earlier version, as it was sent; ?download to save
// it. Nothing for a link that was turned off. Bounded: two at once in the
// process, so many an hour per link (src/lib/downloads.ts).
app.get("/q/:secret/pdf", c => publicFile(async () => {
  const sql = db();
  const today = chest.today();
  const opened = await openLink(sql, c.req.param("secret"), today);
  if (!opened || opened.showing === "off") return null;
  if (!(await linkGuard(sql, opened.link.id))) return c.body(null, 429, { "Retry-After": "3600", "Cache-Control": "no-store" });
  const kind = c.req.query("download") !== undefined ? "attachment" : "inline";
  const asked = c.req.query("version");
  if (asked !== undefined) {
    const found = await versionPdf(sql, opened.full.id, asked).catch(() => null);
    if (!found || found.version >= opened.full.version) return null;
    return { bytes: found.bytes, name: pdfFileName({ ...opened.full, version: found.version }), disposition: kind, type: "application/pdf" };
  }
  if (opened.showing === "revising") return null;
  const answered = opened.answer?.pdfObject ? await keptPdf(opened.answer.pdfObject, opened.answer.pdfSha256) : null;
  const bytes = answered ?? (await shownPdf(sql, opened, today)).bytes;
  return { bytes, name: pdfFileName(opened.full), disposition: kind, type: "application/pdf" };
}));

// The company's terms and conditions of sale, for the client who holds a
// quote's link (nothing for a link turned off).
app.get("/q/:secret/terms", c => publicFile(async () => {
  const sql = db();
  const opened = await openLink(sql, c.req.param("secret"), chest.today());
  if (!opened || opened.showing === "off") return null;
  if (!(await linkGuard(sql, opened.link.id))) return c.body(null, 429, { "Retry-After": "3600", "Cache-Control": "no-store" });
  const terms = await termsFile(sql);
  return terms ? { bytes: terms.bytes, name: termsFileName(opened.full.language), disposition: "inline", type: "application/pdf" } : null;
}));

// ---- What the Chest sends by itself, signed (src/lib/deliveries.ts): the
// members' lifecycle and other tools' events, the schedules' runs.
app.post("/chest-events", c => chestEvents(c.req.raw));
app.post("/chest-schedules", c => chestSchedules(c.req.raw));
