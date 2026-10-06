import { chest } from "@argentic/chest-sdk/chest";
import * as events from "@argentic/chest-sdk/events";
import * as mail from "@argentic/chest-sdk/mail";
import * as schedules from "@argentic/chest-sdk/schedules";
import { after, createApp, download, page, publicPage, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { seen } from "@argentic/chest-app/db";
import { actions } from "./actions.ts";
import { locales, localeOf, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { cleanup, exportRows } from "./lib/candidates.ts";
import * as cv from "./lib/cv.ts";
import { db } from "./lib/db.ts";
import { brandImage, cvFile, messageFile } from "./lib/downloads.ts";
import { everything, theirData } from "./lib/export-all.ts";
import { icsForMember, today } from "./lib/interviews.ts";
import { introFor, settings } from "./lib/jobs.ts";
import { handlers } from "./lib/lifecycle.ts";
import { bounced, received } from "./lib/mail-in.ts";
import { sweepTemplateFiles } from "./lib/messages.ts";
import * as outbox from "./lib/outbox.ts";
import { feedData, salaryWords, xml } from "./lib/public-feed.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { indeedFeed, rssFeed, sitemap } from "./lib/reach.ts";
import { shareDueBusy, takeBusy } from "./lib/share.ts";
import { forgotten, interviewsToday, refreshBadges } from "./lib/tell.ts";
import { zipStream } from "./lib/zip.ts";
import { candidatePage, candidateVersion } from "./pages/candidate.tsx";
import { applyPage, careersPage, jobPage, thanksPage } from "./pages/careers.tsx";
import { interviewPage } from "./pages/interview.tsx";
import { addPage, boardPage, boardVersion, editJobPage, importPage, jobSettingsPage, newJobPage } from "./pages/job.tsx";
import { jobsPage, jobsVersion } from "./pages/jobs.tsx";
import { mailPage, poolPage, reportsPage, searchPage } from "./pages/lists.tsx";
import { settingsPage } from "./pages/settings.tsx";
import { csvLine, textStream } from "@argentic/chest-app";
import { stageLabel } from "./shared/stages.ts";
import { slugify } from "./shared/model.ts";
import { format } from "./shared/format.ts";
import { dayOf, timeOf } from "./shared/time.ts";
import { sheetOf } from "./theme.ts";

// Hiring's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name> and /actions/<name>, the
// member of every /chest request (401 without), the look (/chest/look.css,
// /look.css: src/theme.ts), /lang/<code>, the error pages, and answers 404
// to anything else.
const routes = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  // The team's pages wear the company's choice; the careers pages its
  // brand, else Hiring's own look in the colour chosen in Settings (read
  // from the tool's own table, never a call to the Chest per visitor:
  // chest.theme() keeps its answer a minute).
  look: async viewer => {
    const sheet = viewer.member !== null ? await sheetOf("team") : await sheetOf("public", (await settings(db())).accent);
    // source ("own", "catalogue", "brand"): the layouts mark the page with
    // it (data-look), as the page said before the move.
    return { css: sheet.css, colors: sheet.colors, logo: sheet.look.source === "brand" ? sheet.look.logo ?? null : null, source: sheet.look.source };
  },
  // Hiring's icon; the team's part is never indexed (a careers page says
  // its own robots).
  head: viewer => <><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" />{viewer.member !== null && <meta name="robots" content="noindex, nofollow" />}<meta name="description" content={viewer.t.meta.tagline} /></>,
});

// ---- The team's part (/chest…). A member without a role sees why (the
// layout); a page only a recruiter reads is a 404 for anyone else (the
// rules say not_found). Each page also sends the emails that are due (a
// rejection after its Undo) and the interviews waiting for the calendars,
// once it is answered: the tool has no process of its own, and the
// outbox schedule passes every 15 minutes only.
type TeamRender = (ctx: PageContext<MemberContext>) => Promise<View | Response> | View | Response;
const team = (render: TeamRender, options: { version?: (ctx: PageContext<MemberContext>) => Promise<string | null> } = {}) => page(async ctx => {
  if (!roleOf(ctx.member)) return { title: ctx.t.noAccess.title, body: null };
  after("outbox", () => outbox.flush(db()));
  return render(ctx);
}, options.version ? { version: async ctx => (roleOf(ctx.member) ? options.version!(ctx) : null) } : {});

routes.get("/chest", team(jobsPage, { version: jobsVersion }));
routes.get("/chest/search", team(searchPage));
routes.get("/chest/pool", team(poolPage));
routes.get("/chest/reports", team(reportsPage));
routes.get("/chest/mail", team(mailPage));
routes.get("/chest/settings", team(settingsPage));
// The careers page's logo and photos, shown on Settings (team host).
routes.get("/chest/settings/images/:name{[0-9a-f]{20}\\.(?:png|jpg|webp)}", async c => {
  const s = await settings(db());
  return brandImage(c.get("viewer").member, `public/brand/${c.req.param("name")}`, [...(s.logo ? [s.logo.object] : []), ...s.photos.map(p => p.object)]);
});
routes.get("/chest/jobs/new", team(newJobPage));
routes.get("/chest/jobs/:id", team(boardPage, { version: boardVersion }));
routes.get("/chest/jobs/:id/edit", team(editJobPage));
routes.get("/chest/jobs/:id/settings", team(jobSettingsPage));
routes.get("/chest/jobs/:id/add", team(addPage));
routes.get("/chest/jobs/:id/import", team(importPage));
routes.get("/chest/candidates/:id", team(candidatePage, { version: candidateVersion }));

// Files. A link to each carries `download` (or is a frame's source): the
// browser fetches it once.
routes.get("/chest/candidates/:id/cv", c => cvFile(db(), c.get("viewer").member, c.req.param("id"), c.req.query("download") !== undefined));
routes.get("/chest/messages/:id/files/:file", c => messageFile(db(), c.get("viewer").member, c.req.param("id"), c.req.param("file")));
// A job's candidates as a spreadsheet, headers and words in the reader's
// language, written as the rows are read.
routes.get("/chest/jobs/:id/export", download(async ({ member, t, param }) => {
  const { job, rows } = await exportRows(db(), member, param("id"));
  const h = t.export.headers;
  return {
    name: `${t.export.file}-${slugify(job.title)}.csv`,
    type: "text/csv; charset=utf-8",
    body: textStream((function* () {
      yield "﻿" + csvLine([h.name, h.email, h.phone, h.link, h.stage, h.status, h.reason, h.rating, h.ratings, h.source, h.applied, h.activity]);
      for (const r of rows) yield csvLine([r.name, r.email, r.phone, r.link, stageLabel(r.stage, t.jobSettings.defaults), t.export.status[r.status], r.rejectReason ? t.reject.reasons[r.rejectReason] : "", r.rating ?? "", r.ratings, t.candidate.source[r.source as keyof typeof t.candidate.source] ?? r.source, r.appliedAt.slice(0, 10), r.lastActivityAt.slice(0, 10)]);
    })()),
  };
}));
// A candidate's own data, for their right of access: what they sent, what
// the team wrote about them, the emails and their files, their CV.
routes.get("/chest/candidates/:id/data", download(async ({ member, t, param }) => {
  const { name, entries } = await theirData(db(), member, param("id"), t);
  return { name, type: "application/zip", body: zipStream(entries) };
}));
// Everything, as one archive: spreadsheets and CVs, words in the reader's
// language (src/lib/export-all.ts). Streamed: one CV in memory at a time.
// The rights are checked before the first byte.
routes.get("/chest/export", download(async ({ member, t }) => {
  const entries = everything(db(), member, t);
  const first = await entries.next();
  const rest = (async function* () {
    if (!first.done) yield first.value;
    yield* entries;
  })();
  return { name: `${t.exportAll.file}-${chest.today()}.zip`, type: "application/zip", body: zipStream(rest) };
}));
// An interview as an .ics file (a Chest without calendars: "Add to my
// calendar"), for whoever sees its candidate.
routes.get("/chest/interviews/:id/ics", download(async ({ member, locale, param }) => ({ name: "interview.ics", type: "text/calendar; charset=utf-8", body: await icsForMember(db(), member, param("id"), localeOf(locale)) })));

// ---- The careers page (public). Feeds first: a job's address is a slug.
routes.get("/robots.txt", () => {
  const origin = publicOrigin() ?? "";
  const body = ["User-agent: *", "Allow: /", "Disallow: /chest", "Disallow: /actions/", "Disallow: /lang/", "Disallow: /interview/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
});
routes.get("/jobs.xml", async () => {
  const { jobs, company, origin } = await feedData(db());
  return xml(indeedFeed(jobs, company, origin, salaryWords));
});
routes.get("/feed.xml", publicPage(async ({ t, locale }) => {
  const { jobs, company, origin, settings: s } = await feedData(db());
  // The channel needs a description: the company's words, else a plain
  // "Our open positions." (never words the company did not write).
  const channel = { title: format(t.careers.title, { company: company.name }), description: introFor(s, localeOf(locale)) || t.careers.intro, language: locale };
  const facts = (j: (typeof jobs)[number]) => [j.team, j.place, t.facts.contract[j.contract], t.facts.remote[j.remote]].filter(Boolean).join(" · ");
  return xml(rssFeed(jobs, channel, origin, facts), "application/rss+xml");
}));
routes.get("/sitemap.xml", async () => {
  const { jobs, origin } = await feedData(db());
  return xml(sitemap(jobs, origin));
});
routes.get("/", publicPage(careersPage));
routes.get("/interview/:token", publicPage(interviewPage));
routes.get("/:slug", publicPage(jobPage));
routes.get("/:slug/apply", publicPage(applyPage));
routes.get("/:slug/thanks", publicPage(thanksPage));

// ---- What the Chest sends by itself, signed (never read the body before
// handle()); each comes at least once (seen: chest_seen).
// The members' lifecycle, and what other tools tell (Proposal (studio):
// events between tools — booking.busy, leave.busy).
routes.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, {
    status: await events.handle(c.req.raw, handlers(sql), {
      seen,
      tools: {
        "booking.busy": async e => { await takeBusy(sql, e); },
        "leave.busy": async e => { await takeBusy(sql, e); },
      },
    }),
  });
});
// The schedules of chest.json, read on the Chest's clock:
// - cleanup, every night: candidates whose last news is older than the
//   retention go, with their CVs and their emails' files (CNIL: two years
//   at most by default); files sent but never kept go too;
// - outbox, every 15 minutes: emails that are due (a rejection after its
//   Undo) leave even when nobody has the tool open; interviews reach the
//   interviewers' calendars, and their times the tools linked to Hiring;
// - morning, on weekdays: each interviewer hears of the day's interviews,
//   in the bell and in one email (which honours their email choice).
routes.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {
    cleanup: async run => {
      const sql = db();
      const at = new Date(run.scheduledAt);
      const gone = await cleanup(sql, at);
      await cv.remove(gone.objects);
      await forgotten(gone.notices);
      // Files the Chest could not delete before: tried again.
      await cv.removeLeft(sql);
      await cv.sweep(at);
      // Template files no template holds any more (taken off, deleted).
      await sweepTemplateFiles(sql, at);
      await refreshBadges(sql);
      await seen.forget();
    },
    outbox: async () => {
      await outbox.flush(db(), 100);
      await shareDueBusy(db());
    },
    morning: async run => {
      const zone = chest.timeZone;
      const at = new Date(run.scheduledAt);
      // The day is the run's: a retry after midnight still says that day,
      // under the same keys (one email per person and day).
      await interviewsToday(await today(db(), at), start => timeOf(start, zone), dayOf(at, zone));
    },
  }, { seen }),
}));
// Emails sent to the jobs mailbox — a candidate's answer — and the bounces
// of what the tool sent (Proposal (studio): mail).
routes.post("/chest-mail", async c => {
  const sql = db();
  return new Response(null, {
    status: await mail.handle(c.req.raw, {
      message: async message => {
        await received(sql, message);
        await refreshBadges(sql);
      },
      bounce: bounce => bounced(sql, bounce),
    }, { seen }),
  });
});

// ---- Headers a few answers add: the team's part and a candidate's link
// are never indexed; a candidate's link (its address is the secret) is
// never kept by a cache nor sent as a referrer.
export const app = {
  fetch: async (request: Request, ...rest: unknown[]): Promise<Response> => {
    const response = await (routes.fetch as (r: Request, ...a: unknown[]) => Response | Promise<Response>)(request, ...rest);
    const path = new URL(request.url).pathname;
    const first = path.split("/")[1]?.toLowerCase() ?? "";
    if (first !== "chest" && first !== "interview") return response;
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    if (first === "interview") {
      // The secret leaves no other site: sent only back to this one (a
      // form without JavaScript returns to its page, its refusal said).
      headers.set("Referrer-Policy", "same-origin");
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
