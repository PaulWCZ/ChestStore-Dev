import { createApp, download, page, publicPage } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { chestEvents, chestSchedules } from "./calls.ts";
import { absencesFile, balancesFile } from "./downloads.ts";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout, waitingCounts } from "./layout.tsx";
import { can, roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { waiting } from "./lib/requests.ts";
import { approvalsPage } from "./pages/Approvals.tsx";
import { calendarPage } from "./pages/Calendar.tsx";
import { homePage } from "./pages/Home.tsx";
import { importPage } from "./pages/Import.tsx";
import { newRequestPage } from "./pages/NewRequest.tsx";
import { payrollPage } from "./pages/Payroll.tsx";
import { peoplePage } from "./pages/People.tsx";
import { personPage } from "./pages/Person.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { requestPage } from "./pages/Request.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { lookFor } from "./theme.ts";

// Leave's routes. createApp() already serves /assets/, the actions
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
  // The look: the company's choice, else Seaside (src/theme.ts).
  look: lookFor,
  head: () => <><meta name="robots" content="noindex, nofollow" /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The members' part (/chest…).

// A page of Leave: a member whose role gives nothing sees why (the
// layout's NoAccess), and the page itself does not run. For an approver,
// the requests waiting for their answer are counted first: the layout's
// "To answer" section shows the number.
const members = (render: Parameters<typeof page>[0]) => page(async p => {
  if (!roleOf(p.member)) return { title: p.t.noAccess.title, body: null };
  if (can(p.member, "approve")) waitingCounts.set(p.member, (await waiting(db(), p.member).catch(() => [])).length);
  return render(p);
});

// Home: my balances, "Ask for time off", who is away this week, my requests.
app.get("/chest", members(homePage));
// Asking (?for=mbr_…: recording for someone, HR or their approver).
app.get("/chest/new", members(newRequestPage));
// One request, its answer and its history (the bell links here).
app.get("/chest/requests/:id", members(requestPage));
// What waits for the approver's answer.
app.get("/chest/approvals", members(approvalsPage));
// Who's away: the month (?month=YYYY-MM, ?show=mine|<group>).
app.get("/chest/calendar", members(calendarPage));
// People (HR: everyone, ?show=former; a manager: their people), one
// person, the imports (?what=leave), payroll's files.
app.get("/chest/people", members(peoplePage));
app.get("/chest/people/import", members(importPage));
app.get("/chest/people/payroll", members(payrollPage));
app.get("/chest/people/export", download(({ url, member }) => absencesFile(url, member)));
app.get("/chest/people/balances", download(({ url, member }) => balancesFile(url, member)));
app.get("/chest/people/:id", members(personPage));
// The company's rules and its kinds of leave (HR).
app.get("/chest/settings", members(settingsPage));

// ---- The host's root: Leave has no public part (a Chest answers 404 on
// its public host); outside a Chest, it says where Leave lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (src/calls.ts): the members'
// lifecycle and People's events, and the runs of chest.json's "schedules".
app.post("/chest-events", c => chestEvents(c.req.raw));
app.post("/chest-schedules", c => chestSchedules(c.req.raw));
