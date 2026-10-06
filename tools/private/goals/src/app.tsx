import * as events from "@argentic/chest-sdk/events";
import * as schedules from "@argentic/chest-sdk/schedules";
import { NoAccess } from "@argentic/chest-ui/components";
import { createApp, download, page, publicPage, type PageContext, type View } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { toCsv } from "./lib/csv.ts";
import { dealReopened, dealWon } from "./lib/crm.ts";
import { db } from "./lib/db.ts";
import { checkInsCsv, cycleCsv, fileName } from "./lib/export.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { handlers as fed } from "./lib/sources.ts";
import { refreshBadges, weeklyReminder } from "./lib/tell.ts";
import { zone } from "./lib/time.ts";
import { companyPage } from "./pages/Company.tsx";
import { cyclePage } from "./pages/Cycle.tsx";
import { cyclesPage } from "./pages/Cycles.tsx";
import { editObjectivePage } from "./pages/EditObjective.tsx";
import { homePage } from "./pages/Home.tsx";
import { importPage } from "./pages/Import.tsx";
import { newObjectivePage } from "./pages/NewObjective.tsx";
import { objectivePage } from "./pages/Objective.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { teamPage } from "./pages/Team.tsx";
import { teamsPage } from "./pages/Teams.tsx";
import { pageLook } from "./theme.ts";

// Goals' routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name>, the member of every /chest
// request (401 without the Chest's assertion), the look as a stylesheet of
// its own (/chest/look.css, /look.css: src/theme.ts), /lang/<code>, the
// error pages, and answers 404 to anything else.
export const app = createApp({
  actions, islands, locales, words,
  layouts: { members: MembersLayout, public: PublicLayout },
  // The look: the company's choice for a member's page, else the Trail map.
  look: viewer => pageLook(viewer.member !== null),
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// A page of Goals: a member whose role gives nothing sees why (the layout
// says it), and the page reads nothing.
const goals = (render: (p: PageContext) => Promise<View>) =>
  page(p => (roleOf(p.member) ? render(p) : { title: p.t.noAccess.title, body: <NoAccess labels={{ noAccessTitle: p.t.noAccess.title, noAccessBody: p.t.noAccess.body }} /> }));

// ---- The members' part (/chest…).
app.get("/chest", goals(homePage));
app.get("/chest/company", goals(companyPage));
app.get("/chest/teams", goals(teamsPage));
app.get("/chest/teams/:id", goals(teamPage));
app.get("/chest/objectives/new", goals(newObjectivePage));
app.get("/chest/objectives/:id", goals(objectivePage));
app.get("/chest/objectives/:id/edit", goals(editObjectivePage));
app.get("/chest/cycles", goals(cyclesPage));
app.get("/chest/cycles/:id", goals(cyclePage));
app.get("/chest/import", goals(importPage));
app.get("/chest/settings", goals(settingsPage));

// A cycle as a spreadsheet, in the reader's language: one row per key
// result, or (?what=check-ins) every update. Confidential objectives only
// for those who see them; a refusal is a page in the reader's words.
app.get("/chest/cycles/:id/export", download(async ({ member, t, locale, param, query }) => {
  const out = await (query("what") === "check-ins" ? checkInsCsv : cycleCsv)(db(), member, param("id"), t, localeOf(locale), zone());
  return { name: fileName(out.name, "csv"), type: "text/csv; charset=utf-8", body: out.csv };
}));

// An example file to fill (admins' import), in the reader's language: the
// columns Goals reads first, an objective, its key results.
app.get("/chest/import/example", download(({ member, t }) => {
  const h = t.export.headers, e = t.example;
  const rows = [
    [h.level, h.team, h.objective, h.alignedTo, h.objectiveOwner, h.keyResult, h.keyResultOwner, h.type, h.start, h.target, h.current, h.unit],
    [t.levels.company, "", e.title, "", member.name, e.kr1, member.name, t.kinds.number, "0", "20", "0", e.kr1Unit],
    [t.levels.company, "", e.title, "", member.name, e.kr2, member.name, t.kinds.number, "0", "60", "0", e.kr2Unit],
    [t.levels.company, "", e.title, "", member.name, e.kr3, member.name, t.kinds.milestone, "", "", t.export.notDone, ""],
  ];
  return { name: "goals-example.csv", type: "text/csv; charset=utf-8", body: toCsv(rows, t.export.separator) };
}));

// ---- Outside /chest. Goals has no public part ("public" is not in
// chest.json): the Chest never routes a visitor here. Opened from the
// tool's own process, this page says where Goals lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (the body read by handle()
// only), at least once: the members' lifecycle, the Chest's groups, and
// what the other tools tell (Proposal (studio): events between tools —
// Clients' deals, Tasks' cards, Support's tickets, Hiring's hires:
// src/lib/crm.ts, src/lib/sources.ts).
app.post("/chest-events", async c => {
  const sql = db();
  return new Response(null, {
    status: await events.handle(c.req.raw, handlers(sql), {
      seen,
      tools: {
        "crm.deal.won": async e => { await dealWon(sql, e); },
        "crm.deal.reopened": async e => { await dealReopened(sql, e); },
        ...fed(sql),
      },
    }),
  });
});

// The schedules of chest.json, on the Chest's clock: Friday morning, the
// owners of key results not updated this week hear of it in the bell (and
// by email); Monday morning, every tile's number is set for the new week,
// and what the Chest delivered more than 30 days ago is forgotten. Without
// schedules the tool still works: badges are set whenever people use it.
app.post("/chest-schedules", async c => new Response(null, {
  status: await schedules.handle(c.req.raw, {
    reminder: async run => { await weeklyReminder(db(), new Date(run.scheduledAt)); },
    week: async run => {
      await refreshBadges(db(), null, new Date(run.scheduledAt));
      await seen.forget();
    },
  }, { seen }),
}));
