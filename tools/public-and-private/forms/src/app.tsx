import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import * as webhooks from "@argentic/chest-sdk/webhooks";
import { createApp, download, log, page, publicPage, type MemberContext, type PageContext, type PageOptions, type View, type VisitorContext } from "@argentic/chest-app";
import { seen } from "@argentic/chest-app/db";
import { actions } from "./actions.ts";
import { localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { cleanup, oneAnswer } from "./lib/answers.ts";
import { db } from "./lib/db.ts";
import { answersCsv, archive } from "./lib/downloads.ts";
import { embedOrigins, frameAncestors } from "./lib/embed.ts";
import { told } from "./lib/hooks.ts";
import { sweepImages } from "./lib/images.ts";
import { handlers } from "./lib/lifecycle.ts";
import { pending, refreshBadges } from "./lib/tell.ts";
import * as uploads from "./lib/uploads.ts";
import { answersVersion, homeVersion } from "./lib/versions.ts";
import { lookOf, ownLook, sheetOf } from "./lib/theme.ts";
import { answerPage } from "./pages/Answer.tsx";
import { answersPage } from "./pages/Answers.tsx";
import { buildPage } from "./pages/Build.tsx";
import type { Ctx, PublicCtx } from "./pages/context.ts";
import { homePage } from "./pages/Home.tsx";
import { newPage } from "./pages/New.tsx";
import { privacyPage } from "./pages/Privacy.tsx";
import { publicFormPage, publicHomePage, teamFormPage } from "./pages/Respond.tsx";
import { sentPage } from "./pages/Sent.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { sharePage } from "./pages/Share.tsx";
import { summaryPage } from "./pages/Summary.tsx";
import { trashPage } from "./pages/Trash.tsx";
import { filesIn, type StoredFile } from "./shared/logic.ts";

// Forms' routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the
// member of every /chest request (401 without), the look (/chest/look.css,
// /look.css: src/lib/theme.ts), /lang/<code>, the error pages, and answers
// 404 to anything else.
const routes = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => lookOf(viewer.member !== null ? "team" : "public"),
  // Forms' icon; no search engine indexes a form or the team's pages.
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// The Chest's zone (dates are written on its clock); UTC outside a Chest.
function chestZone(): string {
  try {
    return chest.timeZone;
  } catch {
    return "UTC";
  }
}

// A page of the team's part: the database, the reader's language, the
// Chest's zone; the layout told whether the look is Forms' own. A member
// whose role gives nothing gets the layout's "no access" (nothing read).
type Render = (ctx: Ctx) => Promise<View | Response> | View | Response;
const members = (render: Render, options?: PageOptions<MemberContext>) => page(async (p: PageContext<MemberContext>) => {
  const own = ownLook((await sheetOf("team")).look);
  if (!roleOf(p.member)) return { title: p.t.noAccess.title, body: null, layout: { own, respond: false } };
  const view = await render({ ...p, sql: db(), lang: localeOf(p.locale), zone: chestZone() });
  if (view instanceof Response) return view;
  return { ...view, layout: { own, respond: false, ...view.layout } };
}, options);
type PublicRender = (ctx: PublicCtx) => Promise<View | Response> | View | Response;
const visitors = (render: PublicRender) => publicPage(async (p: PageContext<VisitorContext>) => {
  const own = ownLook((await sheetOf("public")).look);
  const view = await render({ ...p, sql: db(), lang: localeOf(p.locale), zone: chestZone() });
  if (view instanceof Response) return view;
  return { ...view, layout: { own, respond: true, ...view.layout } };
});

// ---- The team's part (/chest…).
routes.get("/chest", members(homePage, { version: p => homeVersion(db(), p.member) }));
routes.get("/chest/new", members(newPage));
routes.get("/chest/trash", members(trashPage));
routes.get("/chest/privacy", members(privacyPage));
routes.get("/chest/sent/:answer", members(sentPage));
routes.get("/chest/f/:slug", members(teamFormPage));
routes.get("/chest/forms/:id", members(buildPage));
routes.get("/chest/forms/:id/share", members(sharePage));
routes.get("/chest/forms/:id/settings", members(settingsPage));
routes.get("/chest/forms/:id/answers", members(answersPage, { version: p => answersVersion(db(), p.member, p.param("id"), p.url.search) }));
routes.get("/chest/forms/:id/summary", members(summaryPage, { version: p => answersVersion(db(), p.member, p.param("id"), "summary") }));
routes.get("/chest/forms/:id/answers/:answer", members(answerPage));

// The answers leaving: a CSV, and everything in a ZIP — written as they
// are read (src/lib/downloads.ts); a refusal is a page in the reader's
// words. Links to them carry `download`.
routes.get("/chest/forms/:id/answers.csv", download(({ member, t, locale, param }) => answersCsv(db(), member, param("id"), t, localeOf(locale), chestZone())));
routes.get("/chest/forms/:id/answers.zip", download(({ member, t, locale, param }) => archive(db(), member, param("id"), t, localeOf(locale), chestZone())));
// A file of an answer: whoever may read the form's answers gets a fresh
// signed link to it from the Chest (15 minutes), never a lasting address.
routes.get("/chest/forms/:id/files/:answer/:question", download(async ({ member, param, query }) => {
  const found = await oneAnswer(db(), member, param("id"), param("answer"));
  const n = Number(query("n") ?? "0");
  const file = (filesIn(found.answer.data[param("question")]).filter(f => "file" in f) as StoredFile[])[Number.isInteger(n) && n >= 0 ? n : 0];
  if (!file) return new Response(null, { status: 404 });
  const url = await uploads.link(file.file, query("download") !== undefined);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}));

// ---- The public part ("public": true): the host's root, a public form.
routes.get("/", visitors(publicHomePage));
routes.get("/:slug{[a-z0-9]{8}}", visitors(publicFormPage));

// ---- What the Chest sends by itself, signed (never read the body before
// handle()): the members' lifecycle ("receives"), the runs of chest.json's
// "schedules", the web addresses it stopped (Proposal (studio): webhooks).
// A handler that throws makes the Chest send it again: they are
// idempotent.
routes.post("/chest-events", async c => new Response(null, { status: await events.handle(c.req.raw, handlers(db()), { seen }) }));

// - bell (every 15 minutes): answers that waited for their batch are told;
// - cleanup (every night): answers older than their form's retention go,
//   with their files; answers and forms put aside long enough go for good;
//   team uploads never attached to an answer go after a day, pictures no
//   form uses any more too, and drafts nobody touched after a day.
routes.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {
    bell: async run => {
      const told = await pending(db(), new Date(run.scheduledAt));
      if (told > 0) log.info("bell", { forms: told });
    },
    cleanup: async run => {
      const sql = db();
      const at = new Date(run.scheduledAt);
      const gone = await cleanup(sql, at);
      await uploads.remove(gone.objects);
      const swept = await uploads.sweep(at);
      const pictures = await sweepImages(sql, at);
      await refreshBadges(sql);
      await seen.forget();
      log.info("cleanup", { answers: gone.answers, forms: gone.forms, files: gone.objects.length, uploads: swept, pictures });
    },
  }, { seen }),
}));

// The Chest's word about the web addresses it delivers answers to: one
// kept failing, or is gone, so the Chest stopped it. Settings shows it
// stopped (Try again), and the form's owner is told in the bell.
routes.post("/chest-webhooks", async c => new Response(null, {
  status: await webhooks.handle(c.req.raw, {
    disabled: event => told(db(), event),
  }, { seen }),
}));

// ---- The public forms may be shown in a frame by the company's websites
// a manager listed (Share, "On your website"; src/lib/embed.ts): their
// page's frame-ancestors names them, read from the database for each such
// page, never kept in the process. The team's pages never. Note: the
// Chest's front adds `frame-ancestors 'none'` to every public answer
// today, and two policies intersect, so the frame works only once the
// Chest lets an administrator allow it (README, "Needs from the SDK").
async function framed(request: Request, response: Response): Promise<Response> {
  const policy = response.headers.get("content-security-policy");
  const path = new URL(request.url).pathname;
  if (!policy || !/^\/[a-z0-9]{8}$/u.test(path) || !response.headers.get("content-type")?.startsWith("text/html")) return response;
  const origins = await embedOrigins();
  if (origins.length === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", policy.replace(/frame-ancestors [^;]*/u, frameAncestors(origins, false)));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const app = {
  fetch: async (request: Request, ...rest: unknown[]): Promise<Response> => framed(request, await (routes.fetch as (r: Request, ...a: unknown[]) => Response | Promise<Response>)(request, ...rest)),
};
