import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { NoAccess } from "@argentic/chest-ui/components";
import { AppError, createApp, page, publicPage, type PageContext, type View } from "@argentic/chest-app";
import { actions } from "./actions.ts";
import { locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { attachment } from "./lib/cards.ts";
import { db } from "./lib/db.ts";
import { onEvent, onSchedule } from "./lib/deliveries.ts";
import { boardCsv, boardJson, everything, fileName } from "./lib/export.ts";
import { boardPage, cardAddress } from "./pages/Board.tsx";
import { boardsPage } from "./pages/Boards.tsx";
import { importPage } from "./pages/Import.tsx";
import { myTasksPage } from "./pages/MyTasks.tsx";
import { searchPage } from "./pages/Search.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { localeOf } from "./i18n/index.ts";
import { pageLook } from "./theme.ts";

// The tool's routes. createApp() already serves /assets/, the actions
// (src/actions.ts), the member of every /chest request — with every group
// of the Chest they are in (the capability "members.groups": a private
// board may be shared with any) —, the look the company
// chose as a stylesheet (/chest/look.css; /look.css outside /chest),
// /lang/<code>, the error pages, and answers 404 to anything else.
export const app = createApp({
  actions, islands, locales, words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => pageLook(viewer.member !== null),
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

// A page of Tasks: a member whose role gives nothing sees why (the layout
// says it), and the page reads nothing.
const tasks = (render: (p: PageContext) => Promise<View | Response> | View | Response) =>
  page(p => (roleOf(p.member) ? render(p) : { title: p.t.noAccess.title, body: <NoAccess labels={{ noAccessTitle: p.t.noAccess.title, noAccessBody: p.t.noAccess.body }} /> }));

// ---- The members' part (/chest…).
app.get("/chest", tasks(myTasksPage));
app.get("/chest/boards", tasks(boardsPage));
app.get("/chest/boards/:id", tasks(boardPage));
app.get("/chest/boards/:id/settings", tasks(settingsPage));
app.get("/chest/cards/:id", tasks(cardAddress));
app.get("/chest/search", tasks(searchPage));
app.get("/chest/import", tasks(importPage));

// Downloads. A board as a file: ?format=csv (a spreadsheet, in the reader's
// words) or ?format=json (everything).
app.get("/chest/boards/:id/export", tasks(async ({ member, t, locale, param, query }) => {
  const json = query("format") === "json";
  const out = await (json ? boardJson(db(), member, param("id")) : boardCsv(db(), member, param("id"), t, localeOf(locale))).catch(refused);
  if (out instanceof Response) return out;
  return download("csv" in out ? out.csv : out.json, fileName(out.name, json ? "json" : "csv"), json ? "application/json" : "text/csv");
}));
// Every board at once, in one JSON file (managers only): what a company
// takes with it when it leaves.
app.get("/chest/export", tasks(async ({ member }) => {
  const json = await everything(db(), member).catch(refused);
  return json instanceof Response ? json : download(json, "tasks-all-boards.json", "application/json");
}));
// A card's file: for whoever sees the card, a fresh 15-minute link signed
// by the Chest (never kept in a page).
app.get("/chest/files/:id", tasks(async ({ member, param, query }) => {
  try {
    const f = await attachment(db(), member, param("id"));
    const { url } = await files.url(f.object, { download: query("download") !== undefined });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}));

const download = (body: string, name: string, type: string) => new Response(body, {
  headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
});
const refused = (error: unknown): Response => {
  if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
  throw error;
};

// ---- Outside /chest. Tasks has no public part ("public" is not in
// chest.json): the Chest never routes a visitor here. Opened from the
// tool's own process, this page says where Tasks lives.
app.get("/", publicPage(({ t }) => ({ title: t.public.title, body: <div className="stack"><h1>{t.public.title}</h1><p>{t.public.body}</p></div> })));

// ---- What the Chest sends by itself, signed: the members' lifecycle and
// the runs of the schedules (src/lib/deliveries.ts).
app.post("/chest-events", c => onEvent(c.req.raw));
app.post("/chest-schedules", c => onSchedule(c.req.raw));
