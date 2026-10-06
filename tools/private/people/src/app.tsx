import { createApp, page, publicPage, type PageContext, type View } from "@argentic/chest-app";
import { NoAccess } from "@argentic/chest-ui/components";
import { actions } from "./actions.ts";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout, todoCounts } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { onEvent, onSchedule } from "./lib/deliveries.ts";
import { openCounts } from "./lib/journeys.ts";
import { chartPage } from "./pages/Chart.tsx";
import { checklistPage } from "./pages/Checklist.tsx";
import { checklistsPage } from "./pages/Checklists.tsx";
import { directoryPage } from "./pages/Directory.tsx";
import { editPage } from "./pages/EditProfile.tsx";
import { directoryCsv, documentLink, registerCsv } from "./pages/Downloads.tsx";
import { importPage } from "./pages/Import.tsx";
import { letterPage } from "./pages/Letter.tsx";
import { lettersPage } from "./pages/Letters.tsx";
import { newChecklistPage } from "./pages/NewChecklist.tsx";
import { numbersPage } from "./pages/Numbers.tsx";
import { profilePage } from "./pages/Profile.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { recordImportPage } from "./pages/RecordImport.tsx";
import { recordPage } from "./pages/Record.tsx";
import { recordsPage } from "./pages/Records.tsx";
import { registerPage } from "./pages/Register.tsx";
import { tablePage } from "./pages/Table.tsx";
import { templatePage } from "./pages/Template.tsx";
import { todoPage } from "./pages/Todo.tsx";
import { pageLook } from "./theme.ts";

// The tool's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name>, the member of every /chest
// request (401 without), the look the company chose as a stylesheet
// (/chest/look.css; /look.css outside /chest), /lang/<code>, the error
// pages, and answers 404 to anything else.
export const app = createApp({
  actions, islands, locales, words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => pageLook(viewer.member !== null),
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// A page of People: a member whose role gives nothing sees why (the layout
// says it), and the page reads nothing. Before it renders, the number of
// the member's open to-dos (the "My to-dos" tab) is read for the layout.
const people = (render: (p: PageContext) => Promise<View | Response>) => page(async p => {
  if (!roleOf(p.member)) return { title: p.t.noAccess.title, body: <NoAccess labels={{ noAccessTitle: p.t.noAccess.title, noAccessBody: p.t.noAccess.body }} /> };
  const [view, open] = await Promise.all([render(p), openCounts(db(), [p.member.id])]);
  todoCounts.set(p.request, open.get(p.member.id) ?? 0);
  return view;
});

// ---- The members' part (/chest…).
app.get("/chest", people(directoryPage));
app.get("/chest/people/:id", people(profilePage));
app.get("/chest/people/:id/edit", people(editPage));
app.get("/chest/chart", people(chartPage));
app.get("/chest/todo", people(todoPage));
app.get("/chest/checklists", people(checklistsPage));
app.get("/chest/checklists/new", people(newChecklistPage));
app.get("/chest/checklists/templates/:id", people(templatePage));
app.get("/chest/checklists/:id", people(checklistPage));
app.get("/chest/import", people(importPage));
app.get("/chest/table", people(tablePage));
app.get("/chest/records", people(recordsPage));
app.get("/chest/records/import", people(recordImportPage));
app.get("/chest/records/letters", people(lettersPage));
app.get("/chest/records/register", people(registerPage));
app.get("/chest/records/:id", people(recordPage));
app.get("/chest/records/:id/letters/:letter", people(letterPage));
app.get("/chest/numbers", people(numbersPage));

// Downloads and a document's signed link (src/pages/Downloads.tsx).
app.get("/chest/export", page(directoryCsv));
app.get("/chest/records/register/csv", page(registerCsv));
app.get("/chest/records/:id/documents/:doc", page(documentLink));

// ---- Outside /chest. People has no public part ("public" is not in
// chest.json): the Chest never routes a visitor here. Opened from the
// tool's own process, this page says where People lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed: the members' lifecycle and
// other tools' events, and the runs of the schedules (src/lib/deliveries.ts).
app.post("/chest-events", c => onEvent(c.req.raw));
app.post("/chest-schedules", c => onSchedule(c.req.raw));
