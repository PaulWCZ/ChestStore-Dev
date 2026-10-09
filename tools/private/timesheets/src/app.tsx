import { createApp, page, publicPage, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { chestEvents, chestSchedules } from "./calls.ts";
import { reportFile } from "./downloads.ts";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { stamp } from "./lib/stamp.ts";
import { clock, today, zone } from "./lib/clock.ts";
import { todayIn } from "./shared/days.ts";
import { importPage } from "./pages/Import.tsx";
import { peoplePage } from "./pages/People.tsx";
import { personWeekPage } from "./pages/PersonWeek.tsx";
import { newProjectPage, projectPage, projectsPage } from "./pages/Projects.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { reportsPage } from "./pages/Reports.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { teamPage } from "./pages/Team.tsx";
import { weekPage } from "./pages/Week.tsx";
import { lookFor } from "./theme.ts";
import { timerView } from "./timer-view.ts";

// Timesheets' routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request (401 without the
// Chest's assertion), /lang/<code>, the look as a stylesheet of its own
// (/chest/look.css: src/theme.ts), the error pages, and answers 404 to
// anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  // The look: the company's choice, else Instrument (src/theme.ts).
  look: lookFor,
  head: viewer => <><meta name="description" content={viewer.t.tool.tagline} /><meta name="robots" content="noindex, nofollow" /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The members' part (/chest…). A page of Timesheets: a member whose
// role gives nothing sees why (the layout's NoAccess), and the page itself
// does not run; otherwise the page, and the timer above it (the layout's
// island, src/timer-view.ts).
// Every page has a version (src/lib/stamp.ts): read again while nothing
// changed (the layout's AutoRefresh), it is a 304, nothing rendered.
const members = (render: (p: PageContext<MemberContext>) => Promise<View>) => page(async p => {
  if (!roleOf(p.member)) return { title: p.t.noAccess.title, body: null };
  const [view, timer] = await Promise.all([render(p), timerView(db(), p.member, p.locale, p.t, p.url.pathname)]);
  return { ...view, layout: { timer } };
}, { version: ({ member }) => (roleOf(member) ? stamp(db(), `${today()}|${todayIn(member.timeZone ?? zone(), clock.now())}`, clock.now()) : null) });

// My week (?week= a Monday, ?day= the day listed).
app.get("/chest", members(weekPage));
// Reports, and their entries as a CSV (the same parameters).
app.get("/chest/reports", members(reportsPage));
app.get("/chest/reports/export", c => reportFile(c, c.get("viewer").member));
// The team's weeks (managers; ?until= a Monday), one person's week.
app.get("/chest/team", members(teamPage));
app.get("/chest/team/:member", members(personWeekPage));
// Rates, cost rates and usual weeks; former people of imports (managers).
app.get("/chest/people", members(peoplePage));
// Clients and projects (managers).
app.get("/chest/projects", members(projectsPage));
app.get("/chest/projects/new", members(newProjectPage));
app.get("/chest/projects/:id", members(projectPage));
// Locked period, approval, usual week and reminder, hours style (managers).
app.get("/chest/settings", members(settingsPage));
// Import from Toggl, Clockify, Harvest (managers).
app.get("/chest/import", members(importPage));

// ---- The host's root: Timesheets has no public part (a Chest answers 404
// on its public host); outside a Chest, it says where Timesheets lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (src/calls.ts): the members'
// lifecycle and Quotes' answer, and the runs of chest.json's "schedules".
app.post("/chest-events", c => chestEvents(c.req.raw));
app.post("/chest-schedules", c => chestSchedules(c.req.raw));
