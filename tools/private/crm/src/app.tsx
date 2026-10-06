import { chest } from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { createApp, download, fail, page, publicPage, textStream, type PageContext, type View } from "@argentic/chest-app";
import { NoAccess } from "@argentic/chest-ui/components";
import { actions } from "./actions.ts";
import { localeOf, words } from "./i18n/index.ts";
import { locales } from "./i18n/index.ts";
import { islands } from "./islands/index.ts";
import { MembersLayout, PublicLayout } from "./layout.tsx";
import { roleOf } from "./lib/access.ts";
import { fileObject } from "./lib/attachments.ts";
import { contact } from "./lib/contacts.ts";
import { db } from "./lib/db.ts";
import { onEvent, onSchedule } from "./lib/deliveries.ts";
import { bookVersion } from "./lib/version.ts";
import { companiesCsv, contactJson, contactsCsv, contactsVcf, dealsCsv, everything, fileName } from "./lib/export.ts";
import { fieldFilterOf } from "./lib/fields.ts";
import { shownName } from "./lib/seed-words.ts";
import { toVcard } from "./shared/vcard.ts";
import { companiesPage, companyPage } from "./pages/Companies.tsx";
import { contactPage, contactsPage } from "./pages/Contacts.tsx";
import { dealPage } from "./pages/Deal.tsx";
import { dealsPage } from "./pages/Deals.tsx";
import { importPage } from "./pages/Import.tsx";
import { myDayPage } from "./pages/MyDay.tsx";
import { publicHome } from "./pages/PublicHome.tsx";
import { searchPage } from "./pages/Search.tsx";
import { fieldsPage, formsCheckPage, settingsPage } from "./pages/Settings.tsx";
import { teamPage } from "./pages/Team.tsx";
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

// A page of Clients: a member whose role gives nothing sees why (the
// layout says it), and the page reads nothing. Its version is the client
// book's (src/lib/version.ts): a refresh with nothing new is a 304, the
// page not even rendered.
const clients = (render: (p: PageContext) => Promise<View | Response> | View | Response) =>
  page(p => (roleOf(p.member) ? render(p) : { title: p.t.noAccess.title, body: <NoAccess labels={{ noAccessTitle: p.t.noAccess.title, noAccessBody: p.t.noAccess.body }} /> }), { version: p => (roleOf(p.member) ? bookVersion(db()) : null) });

// ---- The members' part (/chest…).
app.get("/chest", clients(myDayPage));
app.get("/chest/deals", clients(dealsPage));
app.get("/chest/deals/:id", clients(dealPage));
app.get("/chest/companies", clients(companiesPage));
app.get("/chest/companies/:id", clients(companyPage));
app.get("/chest/contacts", clients(contactsPage));
app.get("/chest/contacts/:id", clients(contactPage));
app.get("/chest/team", clients(teamPage));
app.get("/chest/search", clients(searchPage));
app.get("/chest/import", clients(importPage));
app.get("/chest/settings", clients(settingsPage));
app.get("/chest/settings/fields", clients(fieldsPage));
app.get("/chest/settings/forms", clients(formsCheckPage));

// ---- Downloads (the package's download(): an attachment, never cached; a
// refusal is a page in the reader's words). A list as a file, with the
// filters of the page it came from: companies, contacts or deals as CSV (in
// the reader's words), contacts as vCards — written as the rows are read;
// or the whole client book as one ZIP (a manager).
app.get("/chest/export/:kind", download(async ({ member, t, locale, param, query }) => {
  const sql = db();
  const lang = localeOf(locale);
  const get = (key: string) => query(key) ?? "";
  const stamp = chest.today();
  const field = fieldFilterOf(get);
  const withField = field ? { field } : {};
  const csv = "text/csv; charset=utf-8";
  switch (param("kind")) {
    case "all": return { name: `clients-${stamp}.zip`, type: "application/zip", body: await everything(sql, member, lang, t) };
    case "companies": return { name: `companies-${stamp}.csv`, type: csv, body: textStream(await companiesCsv(sql, member, { q: get("q"), owner: get("owner"), tag: get("tag"), ...withField }, t, lang)) };
    case "contacts": return { name: `contacts-${stamp}.csv`, type: csv, body: textStream(await contactsCsv(sql, member, { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...withField }, t, lang)) };
    case "deals": {
      const status = get("status");
      return { name: `deals-${stamp}.csv`, type: csv, body: textStream(await dealsCsv(sql, member, { q: get("q"), owner: get("owner"), stage: get("stage"), closing: get("closing") === "month" ? "month" : "", status: status === "won" || status === "lost" ? status : status === "any" ? "" : "open", ...withField }, t, lang)) };
    }
    case "vcf": return { name: `contacts-${stamp}.vcf`, type: "text/vcard; charset=utf-8", body: textStream(await contactsVcf(sql, member, { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...withField })) };
    default: return fail("not_found");
  }
}));
// One contact as a vCard, to add to a phone's address book.
app.get("/chest/contacts/:id/vcard", download(async ({ member, t, param }) => {
  const c = await contact(db(), member, param("id"));
  return { name: fileName(c.name, "vcf"), type: "text/vcard; charset=utf-8", body: toVcard({ name: c.name, email: c.email, phone: c.phone, title: c.title, company: c.company?.name ?? "", notes: "", tags: c.tags.map(x => shownName("tags", x, t)), revised: c.updatedAt }) };
}));
// Everything held about one person (their right of access, GDPR art. 15),
// as a JSON file to send them.
app.get("/chest/contacts/:id/data", download(async ({ member, t, locale, param }) => {
  const out = await contactJson(db(), member, param("id"), localeOf(locale), t);
  return { name: fileName(out.name, "json"), type: "application/json; charset=utf-8", body: out.json };
}));
// A file of a record: for whoever reads the record, a fresh 15-minute link
// signed by the Chest (never kept in a page). ?download to save it.
app.get("/chest/files/:id", page(async ({ member, param, query }) => {
  const f = await fileObject(db(), member, param("id"));
  try {
    const { url } = await files.url(f.object, { download: query("download") !== undefined });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return fail(error.code === "not_found" ? "not_found" : "unavailable");
    throw error;
  }
}));

// ---- The host's root: Clients has no public part (a Chest answers 404 on
// its public host); outside a Chest, it says where Clients lives.
app.get("/", publicPage(publicHome));

// ---- What the Chest sends by itself, signed: the members' lifecycle and
// other tools' events, and the runs of chest.json's "schedules"
// (src/lib/deliveries.ts).
app.post("/chest-events", c => onEvent(c.req.raw));
app.post("/chest-schedules", c => onSchedule(c.req.raw));
