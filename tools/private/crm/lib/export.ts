import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./errors.ts";
import { listCompanies, type CompanyFilter } from "./companies.ts";
import { exportContact, listContacts, type ContactFilter } from "./contacts.ts";
import { countryName } from "./countries.ts";
import { listFields } from "./fields.ts";
import { zip } from "./zip.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { listDeals, type DealFilter } from "./deals.ts";
import { amountInput } from "./amount.ts";
import type { Catalogue, Locale } from "./i18n/index.ts";
import { stageName } from "./model.ts";
import { nameOf, people } from "./people.ts";
import { listStages } from "./stages.ts";
import { toVcard } from "./vcard.ts";

// Everything leaves as easily as it came: each list as a CSV any
// spreadsheet opens (headers in the reader's language, formulas
// neutralised by lib/csv.ts), contacts as vCards, one person's whole file
// as JSON (their right of access). Reversibility is part of the promise.

const all = 100_000;

async function owners(ids: (string | null)[], locale: Locale, t: Catalogue): Promise<(id: string | null) => string> {
  const found = await people(ids.filter((x): x is string => x !== null));
  return id => (id === null ? t.people.unassigned : nameOf(found.get(id), locale));
}

// A value of one of the team's fields, as a spreadsheet reads it.
const cellOf = (value: string | number | undefined) => (value === undefined ? "" : typeof value === "number" ? String(value) : value);

export async function companiesCsv(sql: Sql, actor: Member | null, filter: CompanyFilter, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listCompanies(sql, actor, filter, { limit: all });
  const fields = await listFields(sql, "companies");
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.companies;
  return toCsv([
    [h.name, h.website, h.phone, h.email, h.address, h.postcode, h.city, h.country, h.siren, h.vat, h.industry, h.tags, h.owner, h.contacts, h.openDeals, h.openValue, h.notes, ...fields.map(f => f.label)],
    ...rows.map(r => [r.name, r.website, r.phone, r.email, r.address, r.postcode, r.city, countryName(r.country, locale), r.siren, r.vat, r.industry, r.tags.join(", "), owner(r.owner), r.contacts, r.openDeals, amountInput(r.openValue), r.notes, ...fields.map(f => cellOf(r.custom[f.id]))]),
  ]);
}

export async function contactsCsv(sql: Sql, actor: Member | null, filter: ContactFilter, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listContacts(sql, actor, filter, { limit: all });
  const fields = await listFields(sql, "contacts");
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.contacts;
  return toCsv([
    [h.name, h.email, h.phone, h.phone2, h.url, h.title, h.company, h.tags, h.owner, h.lastContact, h.nextStep, h.nextStepDate, h.notes, ...fields.map(f => f.label)],
    ...rows.map(r => [r.name, r.email, r.phone, r.phone2, r.url, r.title, r.company?.name ?? "", r.tags.join(", "), owner(r.owner), r.lastContact?.slice(0, 10) ?? "", r.step?.text ?? "", r.step?.due ?? "", r.notes, ...fields.map(f => cellOf(r.custom[f.id]))]),
  ]);
}

export async function dealsCsv(sql: Sql, actor: Member | null, filter: DealFilter, t: Catalogue, locale: Locale): Promise<string> {
  const { rows } = await listDeals(sql, actor, filter, all);
  const fields = await listFields(sql, "deals");
  const stages = new Map((await listStages(sql)).map(s => [s.id, s]));
  const owner = await owners(rows.map(r => r.owner), locale, t);
  const h = t.export.deals;
  return toCsv([
    [h.title, h.company, h.contact, h.value, h.currency, h.stage, h.probability, h.closeDate, h.owner, h.status, h.reason, h.nextStep, h.nextStepDate, h.created, ...fields.map(f => f.label)],
    ...rows.map(r => {
      const s = stages.get(r.stageId);
      return [r.title, r.company?.name ?? "", r.contact?.name ?? "", amountInput(r.value), r.currency, s ? stageName(s, t.stages) : "", s?.probability ?? "", r.expectedClose ?? "", owner(r.owner), s ? t.export.status[s.kind] : "", r.reason, r.step?.text ?? "", r.step?.due ?? "", r.createdAt.slice(0, 10), ...fields.map(f => cellOf(r.custom[f.id]))];
    }),
  ]);
}

// Contacts as one .vcf file (vCard 4.0).
export async function contactsVcf(sql: Sql, actor: Member | null, filter: ContactFilter = {}): Promise<string> {
  const { rows } = await listContacts(sql, actor, filter, { limit: all });
  return rows.map(r => toVcard({ name: r.name, email: r.email, phone: r.phone, title: r.title, company: r.company?.name ?? "", notes: r.notes, tags: r.tags, revised: r.updatedAt })).join("");
}

// One person's whole file, for their right of access: what the company
// holds about them, with the team's names.
export async function contactJson(sql: Sql, actor: Member | null, contactId: unknown, locale: Locale, t: Catalogue): Promise<{ name: string; json: string }> {
  const data = await exportContact(sql, actor, contactId);
  const contactFields = await listFields(sql, "contacts");
  const ids = [data.contact.owner, ...data.activities.map(a => a.author), ...data.steps.map(s => s.owner)].filter((x): x is string => typeof x === "string");
  const who = await people(ids);
  const name = (id: string | null) => (id === null ? null : id === "chest" ? null : nameOf(who.get(id), locale));
  const c = data.contact;
  return {
    name: c.name,
    json: JSON.stringify({
      format: "chest-clients-contact/1",
      exportedAt: new Date().toISOString(),
      contact: { name: c.name, email: c.email, phone: c.phone, otherPhone: c.phone2, web: c.url, fields: Object.fromEntries(contactFields.filter(f => c.custom[f.id] !== undefined).map(f => [f.label, c.custom[f.id]])), title: c.title, company: c.company?.name ?? null, tags: c.tags, notes: c.notes, owner: name(c.owner), createdAt: c.createdAt, updatedAt: c.updatedAt, lastContact: c.lastContact },
      deals: data.deals.map(d => ({ title: d.title, value: amountInput(d.valueCents), stage: d.stage, createdAt: d.createdAt })),
      activities: data.activities.map(a => ({ kind: t.timeline.kinds[a.kind], text: a.body, by: name(a.author), at: a.at, deal: a.deal?.title ?? null })),
      nextSteps: data.steps.map(s => ({ text: s.text, due: s.due, time: s.time, owner: name(s.owner), doneAt: s.doneAt })),
      files: data.files,
    }, null, 2),
  };
}

// fileName makes a name safe in a download.
export function fileName(name: string, extension: string): string {
  const base = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^A-Za-z0-9 _-]/gu, "").trim().replace(/\s+/gu, "-").slice(0, 60) || "export";
  return `${base}.${extension}`;
}

// The whole client book at once, for leaving (or a backup): one ZIP of CSV
// files with stable English column names and the records' ids, so another
// tool (or a script) reads them without knowing the reader's language.
// Team members appear by name and id. For a manager.
export async function everything(sql: Sql, actor: Member | null, locale: Locale, t: Catalogue): Promise<Uint8Array> {
  if (!can(actor, "export.all")) throw new AppError("forbidden");
  const fields = await listFields(sql);
  const of = (object: string) => fields.filter(f => f.object === object);
  const companies = await sql<Record<string, unknown>[]>`select * from companies order by id`;
  const contacts = await sql<Record<string, unknown>[]>`select c.*, o.name as company_name from contacts c left join companies o on o.id = c.company_id order by c.id`;
  const deals = await sql<Record<string, unknown>[]>`
    select d.*, coalesce(s.name, s.key) as stage, s.kind as status, s.probability, o.name as company_name, c.name as contact_name
    from deals d join stages s on s.id = d.stage_id left join companies o on o.id = d.company_id left join contacts c on c.id = d.contact_id order by d.id`;
  const activities = await sql<Record<string, unknown>[]>`select * from activities where removed_at is null order by at, id`;
  const steps = await sql<Record<string, unknown>[]>`select *, to_char(due_on, 'YYYY-MM-DD') as due from steps order by id`;
  const ids = [...companies, ...contacts, ...deals, ...steps].map(r => r["owner"] as string | null).concat(activities.map(a => a["author"] as string));
  const found = await people(ids.filter((x): x is string => typeof x === "string" && x.startsWith("mbr_")));
  const who = (id: unknown) => (typeof id === "string" && id.startsWith("mbr_") ? nameOf(found.get(id), locale) : id === "erased" ? t.people.erased : "");
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v));
  const custom = (r: Record<string, unknown>, object: string) => of(object).map(f => cellOf(((r["custom"] ?? {}) as Record<string, string | number>)[f.id]));
  const files = [
    { name: "companies.csv", rows: [
      ["id", "name", "website", "phone", "email", "address", "postcode", "city", "country", "siren", "vat", "industry", "tags", "notes", "owner", "owner_id", "created_at", ...of("companies").map(f => f.label)],
      ...companies.map(r => [r["id"], r["name"], r["website"], r["phone"], r["email"], r["address"], r["postcode"], r["city"], r["country"], r["siren"], r["vat"], r["industry"], (r["tags"] as string[]).join(", "), r["notes"], who(r["owner"]), r["owner"] ?? "", day(r["created_at"]), ...custom(r, "companies")]),
    ] },
    { name: "contacts.csv", rows: [
      ["id", "name", "email", "phone", "other_phone", "web", "title", "company_id", "company", "tags", "notes", "owner", "owner_id", "last_contact_at", "created_at", ...of("contacts").map(f => f.label)],
      ...contacts.map(r => [r["id"], r["name"], r["email"], r["phone"], r["phone2"], r["url"], r["title"], r["company_id"] ?? "", r["company_name"] ?? "", (r["tags"] as string[]).join(", "), r["notes"], who(r["owner"]), r["owner"] ?? "", day(r["last_contact_at"]), day(r["created_at"]), ...custom(r, "contacts")]),
    ] },
    { name: "deals.csv", rows: [
      ["id", "title", "company_id", "company", "contact_id", "contact", "value", "currency", "stage", "status", "probability", "expected_close", "reason", "closed_at", "owner", "owner_id", "created_at", ...of("deals").map(f => f.label)],
      ...deals.map(r => [r["id"], r["title"], r["company_id"] ?? "", r["company_name"] ?? "", r["contact_id"] ?? "", r["contact_name"] ?? "", amountInput(Number(r["value_cents"])), r["currency"], r["stage"], r["status"], r["probability"], r["expected_close"] ? day(r["expected_close"]).slice(0, 10) : "", r["reason"], day(r["closed_at"]), who(r["owner"]), r["owner"] ?? "", day(r["created_at"]), ...custom(r, "deals")]),
    ] },
    { name: "activities.csv", rows: [
      ["id", "at", "kind", "text", "deal_id", "contact_id", "company_id", "author", "author_id"],
      ...activities.map(r => [r["id"], day(r["at"]), r["kind"], r["body"], r["deal_id"] ?? "", r["contact_id"] ?? "", r["company_id"] ?? "", who(r["author"]) || ((r["data"] as Record<string, unknown>)["by"] ?? ""), r["author"]]),
    ] },
    { name: "next-steps.csv", rows: [
      ["id", "text", "due", "time", "done_at", "deal_id", "contact_id", "owner", "owner_id"],
      ...steps.map(r => [r["id"], r["text"], r["due"], r["due_time"] ?? "", day(r["done_at"]), r["deal_id"] ?? "", r["contact_id"] ?? "", who(r["owner"]), r["owner"] ?? ""]),
    ] },
    { name: "fields.csv", rows: [["id", "object", "label", "kind", "choices"], ...fields.map(f => [f.id, f.object, f.label, f.kind, f.options.join(" | ")])] },
  ];
  return zip(files.map(f => ({ name: f.name, text: toCsv(f.rows) })));
}
