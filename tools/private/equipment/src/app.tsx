import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError, createApp, csvLine, page, publicPage, type PageContext, type View } from "@argentic/chest-app";
import { NoAccess } from "@argentic/chest-ui/components";
import { stream } from "hono/streaming";
import { actions } from "./actions.ts";
import { catalogue, localeOf, locales, words } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { can, roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { onEvent, onSchedule } from "./lib/deliveries.ts";
import { exportHeader, exportRow } from "./lib/export.ts";
import { allFields } from "./lib/fields.ts";
import { invoiceOf, listItems, photoOf, sorts } from "./lib/items.ts";
import { nameOf, people } from "./lib/people.ts";
import { holderIds } from "./lib/view.ts";
import { editItemPage } from "./pages/EditItem.tsx";
import { handoverPage } from "./pages/Handover.tsx";
import { importPage } from "./pages/Import.tsx";
import { inventoryPage } from "./pages/Inventory.tsx";
import { inventoryReportPage } from "./pages/InventoryReport.tsx";
import { itemPage } from "./pages/Item.tsx";
import { itemsPage } from "./pages/Items.tsx";
import { labelsPage } from "./pages/Labels.tsx";
import { minePage } from "./pages/Mine.tsx";
import { newItemPage } from "./pages/NewItem.tsx";
import { overviewPage } from "./pages/Overview.tsx";
import { peoplePage } from "./pages/People.tsx";
import { personPage } from "./pages/Person.tsx";
import { returnSheetPage } from "./pages/ReturnSheet.tsx";
import { settingsPage } from "./pages/Settings.tsx";
import { pageLook } from "./theme.ts";

// The tool's routes. createApp() already serves /assets/, the actions
// (src/actions.ts) at /chest/actions/<name>, the member of every /chest
// request (401 without), the look the company chose as a stylesheet
// (/chest/look.css; /look.css outside /chest), /lang/<code>, the error
// pages, and 404 for anything else.
export const app = createApp({
  actions, islands, locales, words,
  layouts: { members: MembersLayout, public: PublicLayout },
  look: viewer => pageLook(viewer.member !== null),
  head: viewer => <><meta name="robots" content="noindex, nofollow" /><meta name="description" content={viewer.t.meta.tagline} /><link rel="icon" href="/assets/icon.svg" type="image/svg+xml" /></>,
});

type Render = (p: PageContext) => Promise<View | Response> | View | Response;

// A page of Equipment: someone whose role gives nothing sees why (the
// layout says it) and the page reads nothing.
const equipment = (render: Render) => page(p => (roleOf(p.member) ? render(p) : { title: p.t.noAccess.title, body: null }));

// A managers' page asked by someone else: HTTP 403 and the kit's NoAccess
// — "This page is for managers", and the way to their own things — the
// same on every such page, before anything is read. Something a member
// may not see at all (someone else's item or sheet) stays "not found".
function managers(render: Render) {
  return async (c: Parameters<ReturnType<typeof page>>[0]) => {
    let refused = false;
    const answer = await equipment(p => {
      if (can(p.member, "items.manage")) return render(p);
      refused = true;
      const t = p.t;
      return { title: t.managersOnly.title, body: <div className="narrow"><NoAccess title={t.managersOnly.title} body={t.managersOnly.body} action={<a className="button quiet" href="/chest/mine">{t.managersOnly.back}</a>} /></div> };
    })(c);
    return refused ? new Response(answer.body, { status: 403, headers: answer.headers }) : answer;
  };
}

// ---- The members' part (/chest…). Managers find the overview first;
// members, their own equipment.
app.get("/chest", equipment(p => (can(p.member, "items.manage") ? overviewPage(p) : minePage(p))));
app.get("/chest/mine", equipment(minePage));
app.get("/chest/items", equipment(itemsPage));
app.get("/chest/items/new", managers(newItemPage));
app.get("/chest/items/:id", equipment(itemPage));
app.get("/chest/items/:id/edit", managers(editItemPage));
app.get("/chest/people", managers(peoplePage));
app.get("/chest/people/:id", managers(personPage));
// The person themself prints their own handover sheet; a manager, anyone's.
app.get("/chest/people/:id/handover", equipment(handoverPage));
app.get("/chest/people/:id/return", managers(returnSheetPage));
app.get("/chest/inventory", managers(inventoryPage));
app.get("/chest/inventory/:id", managers(inventoryReportPage));
app.get("/chest/labels", managers(labelsPage));
app.get("/chest/import", managers(importPage));
app.get("/chest/settings", managers(settingsPage));

// An item's photo (for whoever may see the item) and its purchase invoice
// (managers): a fresh link signed by the Chest, never kept in a page.
const signed = async (object: () => Promise<{ url: string }>): Promise<Response> => {
  try {
    const { url } = await object();
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" || error.code === "no_thumbnail" ? 404 : 503 });
    throw error;
  }
};
app.get("/chest/items/:id/photo", equipment(({ member, param, query }) =>
  signed(async () => files.url(await photoOf(db(), member, param("id")), { thumbnail: query("size") === "1024" ? 1024 : 256 }))));
app.get("/chest/items/:id/invoice", equipment(({ member, param }) => signed(async () => files.url(await invoiceOf(db(), member, param("id"))))));

// The equipment as CSV (managers), in their language, with the filters of
// the list, written as the rows are read (500 at a time: little memory
// whatever the size). The file reads back into the importer.
app.get("/chest/export", managers(({ member, locale: language, query }) => {
  const locale = localeOf(language);
  const t = catalogue(locale);
  const sort = query("sort") ?? "tag";
  const filters = { q: query("q") ?? "", category: query("category") ?? "", status: query("status") ?? "", holder: query("holder") ?? "", sort: sorts.includes(sort as never) ? sort : "tag" };
  const headers = { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${t.export.filename}-${chest.today()}.csv"`, "Cache-Control": "no-store" };
  const currency = chest.currency;
  return new Response(new ReadableStream<Uint8Array>({
    async start(out) {
      const encoder = new TextEncoder();
      const encode = (text: string) => out.enqueue(encoder.encode(text));
      try {
        const fields = await allFields(db());
        const header = exportHeader(t, fields);
        encode("﻿" + csvLine(header.cells));
        for (let offset = 0; ; offset += 500) {
          const items = await listItems(db(), member, filters, 500, offset);
          if (items.length === 0) break;
          const names = await people(holderIds(items));
          encode(items.map(i => csvLine(exportRow(i, t, currency, id => (id === "erased" ? t.people.erased : nameOf(names.get(id), locale)), header))).join(""));
          if (items.length < 500) break;
        }
        out.close();
      } catch (error) {
        out.error(error);
      }
    },
  }), { headers });
}));

// ---- Outside /chest. Equipment has no public part ("public" is not in
// chest.json): the Chest never routes a visitor here. Opened from the
// tool's own process, this page says where the tool lives.
app.get("/", publicPage(({ t }) => ({ title: t.public.title, body: <div className="stack"><h1>{t.public.title}</h1><p>{t.public.body}</p></div> })));

// ---- What the Chest sends by itself, signed: the members' lifecycle,
// People's departures and the runs of the schedules (src/lib/deliveries.ts).
app.post("/chest-events", c => onEvent(c.req.raw));
app.post("/chest-schedules", c => onSchedule(c.req.raw));
