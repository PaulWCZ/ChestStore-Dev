import { createApp, page, publicPage } from "@argentic/chest-app";
import { bodyLimit } from "hono/body-limit";
import { actions } from "./actions.ts";
import { chestEvents, chestSchedules, exportAll, exportPage, exportSpace, importUpload, leaveEditor, openFile, readsCsv } from "./calls.ts";
import { framed } from "./frame.tsx";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { withGroups } from "./lib/groups.ts";
import { limits } from "./lib/model.ts";
import { editPage } from "./pages/Edit.tsx";
import { historyPage } from "./pages/History.tsx";
import { homePage } from "./pages/Home.tsx";
import { importPage } from "./pages/Import.tsx";
import { readPage } from "./pages/Page.tsx";
import { pagesPage } from "./pages/Pages.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { readsPage } from "./pages/Reads.tsx";
import { searchPage } from "./pages/Search.tsx";
import { spacePage } from "./pages/Space.tsx";
import { spaceSettingsPage } from "./pages/SpaceSettings.tsx";
import { synonymsPage } from "./pages/Synonyms.tsx";
import { trashPage } from "./pages/Trash.tsx";
import { lookFor } from "./theme.ts";

// The wiki's routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the look (/chest/look.css), the member of every /chest
// request — with every group they are in, asked of the Chest once per
// request and kept a minute (src/lib/groups.ts: the assertion names only
// the groups that give the wiki, and a space may be kept to any) —,
// /lang/<code>, the error pages, and answers 404 to anything else.
export const app = createApp({
  actions,
  islands,
  locales,
  words,
  layouts: { members: MembersLayout, public: PublicLayout },
  complete: withGroups,
  // The look: the company's choice, else Library (src/theme.ts), served by
  // the package at /chest/look.css and /look.css.
  look: lookFor,
  head: () => <><meta name="robots" content="noindex, nofollow" /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// ---- The members' part (/chest…). Every page in its frame (src/frame.tsx:
// the sidebar's tree); a member whose role gives nothing sees why.
const members = (render: Parameters<typeof framed>[0]) => page(framed(render));

// Home: search, drafts, pages to read or check, recently updated, spaces.
app.get("/chest", members(homePage));
// Every space and its tree (the way to the pages on a phone).
app.get("/chest/pages", members(pagesPage));
// A space as a table of contents; its settings (its editors).
app.get("/chest/spaces/:id", members(spacePage));
app.get("/chest/spaces/:id/settings", members(spaceSettingsPage));
// A page: read it, edit it (the lock is taken once the editor is on
// screen), its history, who has read it.
app.get("/chest/pages/:id", members(readPage));
app.get("/chest/pages/:id/edit", members(editPage));
app.get("/chest/pages/:id/history", members(historyPage));
app.get("/chest/pages/:id/reads", members(readsPage));
// Search, and the words that mean the same (editors).
app.get("/chest/search", members(searchPage));
app.get("/chest/search/synonyms", members(synonymsPage));
// Import (editors), the trash.
app.get("/chest/import", members(importPage));
app.get("/chest/trash", members(trashPage));

// Files and downloads (src/calls.ts): a page's image or file through a
// fresh link of the Chest; a page, a space, everything as Markdown, HTML
// or zip; who confirmed reading a page, as a table.
app.get("/chest/files/:id", c => openFile(c.req.raw, c.get("viewer").member, c.req.param("id")));
app.get("/chest/pages/:id/export", c => exportPage(c.req.raw, c.get("viewer").member, c.req.param("id")));
app.get("/chest/pages/:id/reads/csv", c => readsCsv(c.get("viewer").member, c.req.param("id")));
app.get("/chest/spaces/:id/export", c => exportSpace(c.req.raw, c.get("viewer").member, c.req.param("id")));
app.get("/chest/export", c => exportAll(c.req.raw, c.get("viewer").member));

// What the pages send that is not an action: the import's files (a form
// of up to 60 MB, read in memory) and the editor's beacon as it closes.
app.post("/chest/api/import", bodyLimit({ maxSize: limits.importBytes + (1 << 20), onError: c => c.json({ error: "file_too_large" }, 413) }), c => importUpload(c.req.raw, c.get("viewer").member));
app.post("/chest/api/pages/:id/leave", c => leaveEditor(c.req.raw, c.get("viewer").member, c.req.param("id")));

// ---- The host's root: the wiki has no public part (a Chest answers 404
// on its public host); outside a Chest, it says where the wiki lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed (src/calls.ts): the members'
// lifecycle and the groups' changes, and the runs of chest.json's
// "schedules".
app.post("/chest-events", c => chestEvents(c.req.raw));
app.post("/chest-schedules", c => chestSchedules(c.req.raw));
