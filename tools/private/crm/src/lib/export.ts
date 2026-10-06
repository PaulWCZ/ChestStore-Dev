import { shownName } from "./seed-words.ts";
import { typeName } from "./from-booking.ts";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./errors.ts";
import { zipStream, type ZipEntry } from "@argentic/chest-app";
import { companyStream, type CompanyFilter } from "./companies.ts";
import { contactStream, exportContact, type ContactFilter } from "./contacts.ts";
import { countryName } from "./countries.ts";
import { listFields, optionLabel } from "./fields.ts";
import type { FieldDef } from "../shared/custom.ts";
import { csvRow, toCsv } from "../shared/csv.ts";
import type { Sql } from "./db.ts";
import { dealStream, type DealFilter } from "./deals.ts";
import { amountInput } from "../shared/amount.ts";
import { chest } from "@argentic/chest-sdk/chest";
import { catalogue, format, localeOf, type Catalogue, type Locale } from "../i18n/index.ts";
import { stageName } from "../shared/model.ts";
import { nameOf, people } from "./people.ts";
import { listStages } from "./stages.ts";
import { toVcard } from "../shared/vcard.ts";

// Everything leaves as easily as it came: each list as a CSV any
// spreadsheet opens (headers in the reader's language, formulas
// neutralised by shared/csv.ts), contacts as vCards, one person's whole
// file as JSON (their right of access), the whole book as a ZIP.
// Reversibility is part of the promise. The lists and the book are
// written as they are read (a cursor, a batch of rows at a time): an
// export of any size fits the tool's memory (256 MiB).

async function owners(ids: (string | null)[], locale: Locale, t: Catalogue): Promise<(id: string | null) => string> {
  const found = await people(ids.filter((x): x is string => x !== null));
  return id => (id === null ? t.people.unassigned : nameOf(found.get(id), locale));
}

// A value of one of the team's fields, as a spreadsheet reads it.
const cellOf = (value: string | number | undefined, f?: FieldDef) => (value === undefined ? "" : typeof value === "number" ? String(value) : f && f.kind === "choice" ? optionLabel(f, value) : value);

// The lines of a CSV: its header (with the byte-order mark), then each
// batch's rows. The rights were checked before the first line (the
// stream's own function): a refusal is a page, never half a file.
async function* lines<R>(header: unknown[], batches: AsyncIterable<R[]>, row: (r: R) => unknown[]): AsyncGenerator<string> {
  yield csvRow(header, true);
  for await (const batch of batches) yield batch.map(r => csvRow(row(r))).join("");
}

export async function companiesCsv(sql: Sql, actor: Member | null, filter: CompanyFilter, t: Catalogue, locale: Locale): Promise<AsyncIterable<string>> {
  const { owners: ids, batches } = await companyStream(sql, actor, filter);
  const fields = await listFields(sql, "companies", t);
  const owner = await owners(ids, locale, t);
  const h = t.export.companies;
  return lines(
    [h.name, h.website, h.phone, h.email, h.address, h.postcode, h.city, h.country, h.siren, h.vat, h.industry, h.tags, h.owner, h.contacts, h.openDeals, format(h.openValue, { currency: chest.currency }), h.notes, ...fields.map(f => f.label)],
    batches,
    r => [r.name, r.website, r.phone, r.email, r.address, r.postcode, r.city, countryName(r.country, locale), r.siren, r.vat, shownName("industries", r.industry, t), r.tags.map(x => shownName("tags", x, t)).join(", "), owner(r.owner), r.contacts, r.openDeals, amountInput(r.openValue), r.notes, ...fields.map(f => cellOf(r.custom[f.id], f))],
  );
}

export async function contactsCsv(sql: Sql, actor: Member | null, filter: ContactFilter, t: Catalogue, locale: Locale): Promise<AsyncIterable<string>> {
  const { owners: ids, batches } = await contactStream(sql, actor, filter);
  const fields = await listFields(sql, "contacts", t);
  const owner = await owners(ids, locale, t);
  const h = t.export.contacts;
  return lines(
    [h.name, h.email, h.phone, h.phone2, h.url, h.title, h.company, h.tags, h.owner, h.lastContact, h.nextStep, h.nextStepDate, h.notes, ...fields.map(f => f.label)],
    batches,
    r => [r.name, r.email, r.phone, r.phone2, r.url, r.title, r.company?.name ?? "", r.tags.map(x => shownName("tags", x, t)).join(", "), owner(r.owner), r.lastContact?.slice(0, 10) ?? "", r.step?.text ?? "", r.step?.due ?? "", r.notes, ...fields.map(f => cellOf(r.custom[f.id], f))],
  );
}

export async function dealsCsv(sql: Sql, actor: Member | null, filter: DealFilter, t: Catalogue, locale: Locale): Promise<AsyncIterable<string>> {
  const { owners: ids, batches } = await dealStream(sql, actor, filter);
  const fields = await listFields(sql, "deals", t);
  const stages = new Map((await listStages(sql)).map(s => [s.id, s]));
  const owner = await owners(ids, locale, t);
  const h = t.export.deals;
  return lines(
    [h.title, h.company, h.contact, h.value, h.currency, h.stage, h.probability, h.closeDate, h.owner, h.status, h.reason, h.nextStep, h.nextStepDate, h.created, ...fields.map(f => f.label)],
    batches,
    r => {
      const s = stages.get(r.stageId);
      return [r.title, r.company?.name ?? "", r.contact?.name ?? "", amountInput(r.value), r.currency, s ? stageName(s, t.stages) : "", s?.probability ?? "", r.expectedClose ?? "", owner(r.owner), s ? t.export.status[s.kind] : "", r.reason, r.step?.text ?? "", r.step?.due ?? "", r.createdAt.slice(0, 10), ...fields.map(f => cellOf(r.custom[f.id], f))];
    },
  );
}

// Contacts as one .vcf file (vCard 4.0), written as they are read.
export async function contactsVcf(sql: Sql, actor: Member | null, filter: ContactFilter = {}): Promise<AsyncIterable<string>> {
  const { batches } = await contactStream(sql, actor, filter);
  const t = catalogue(localeOf(actor?.language));
  return (async function* () {
    for await (const batch of batches) yield batch.map(r => toVcard({ name: r.name, email: r.email, phone: r.phone, title: r.title, company: r.company?.name ?? "", notes: r.notes, tags: r.tags.map(x => shownName("tags", x, t)), revised: r.updatedAt })).join("");
  })();
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
      activities: data.activities.map(a => ({ kind: t.timeline.kinds[a.kind], text: a.body, by: name(a.author), at: a.at, deal: a.deal?.title ?? null, ...(a.kind === "booking" ? { meeting: { type: typeName(a.data["type"], locale), start: a.data["start"] ?? null, end: a.data["end"] ?? null, cancelled: a.data["status"] === "cancelled" } } : {}) })),
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
// Team members appear by name and id. For a manager. Written as it is
// read: each table through a cursor, a file at a time (the package's
// zipStream), never whole in memory. Values exactly as stored: a machine
// export (no formula guard; the lists people open have it).
export async function everything(sql: Sql, actor: Member | null, locale: Locale, t: Catalogue): Promise<ReadableStream<Uint8Array>> {
  if (!can(actor, "export.all")) throw new AppError("forbidden");
  const fields = await listFields(sql);
  const of = (object: string) => fields.filter(f => f.object === object);
  // Every member the book names, asked once (names come from the Chest).
  const ids = (await sql<{ id: string }[]>`
    select owner as id from companies where owner like 'mbr_%' union select owner from contacts where owner like 'mbr_%'
    union select owner from deals where owner like 'mbr_%' union select owner from steps where owner like 'mbr_%'
    union select author from activities where author like 'mbr_%'`).map(r => r.id);
  const found = await people(ids);
  const who = (id: unknown) => (typeof id === "string" && id.startsWith("mbr_") ? nameOf(found.get(id), locale) : id === "erased" ? t.people.erased : "");
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v));
  const custom = (r: Record<string, unknown>, object: string) => of(object).map(f => cellOf(((r["custom"] ?? {}) as Record<string, string | number>)[f.id]));
  const table = (header: unknown[], query: () => AsyncIterable<Record<string, unknown>[]>, row: (r: Record<string, unknown>) => unknown[]) => (async function* () {
    yield encode(csvRow(header, true, true));
    for await (const batch of query()) yield encode(batch.map(r => csvRow(row(r), false, true)).join(""));
  })();
  const batch = 500;
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: "companies.csv", data: table(
      ["id", "name", "website", "phone", "email", "address", "postcode", "city", "country", "siren", "vat", "industry", "tags", "notes", "owner", "owner_id", "created_at", ...of("companies").map(f => f.label)],
      () => sql<Record<string, unknown>[]>`select * from companies order by id`.cursor(batch),
      r => [r["id"], r["name"], r["website"], r["phone"], r["email"], r["address"], r["postcode"], r["city"], r["country"], r["siren"], r["vat"], shownName("industries", String(r["industry"] ?? ""), t), (r["tags"] as string[]).map(x => shownName("tags", x, t)).join(", "), r["notes"], who(r["owner"]), r["owner"] ?? "", day(r["created_at"]), ...custom(r, "companies")],
    ) };
    yield { name: "contacts.csv", data: table(
      ["id", "name", "email", "phone", "other_phone", "web", "title", "company_id", "company", "tags", "notes", "owner", "owner_id", "last_contact_at", "created_at", ...of("contacts").map(f => f.label)],
      () => sql<Record<string, unknown>[]>`select c.*, o.name as company_name from contacts c left join companies o on o.id = c.company_id order by c.id`.cursor(batch),
      r => [r["id"], r["name"], r["email"], r["phone"], r["phone2"], r["url"], r["title"], r["company_id"] ?? "", r["company_name"] ?? "", (r["tags"] as string[]).map(x => shownName("tags", x, t)).join(", "), r["notes"], who(r["owner"]), r["owner"] ?? "", day(r["last_contact_at"]), day(r["created_at"]), ...custom(r, "contacts")],
    ) };
    yield { name: "deals.csv", data: table(
      ["id", "title", "company_id", "company", "contact_id", "contact", "value", "currency", "stage", "status", "probability", "expected_close", "reason", "closed_at", "owner", "owner_id", "created_at", ...of("deals").map(f => f.label)],
      () => sql<Record<string, unknown>[]>`
        select d.*, coalesce(s.name, s.key) as stage, s.kind as status, s.probability, o.name as company_name, c.name as contact_name
        from deals d join stages s on s.id = d.stage_id left join companies o on o.id = d.company_id left join contacts c on c.id = d.contact_id order by d.id`.cursor(batch),
      r => [r["id"], r["title"], r["company_id"] ?? "", r["company_name"] ?? "", r["contact_id"] ?? "", r["contact_name"] ?? "", amountInput(Number(r["value_cents"])), r["currency"], r["stage"], r["status"], r["probability"], r["expected_close"] ? day(r["expected_close"]).slice(0, 10) : "", r["reason"], day(r["closed_at"]), who(r["owner"]), r["owner"] ?? "", day(r["created_at"]), ...custom(r, "deals")],
    ) };
    yield { name: "activities.csv", data: table(
      ["id", "at", "kind", "text", "deal_id", "contact_id", "company_id", "author", "author_id"],
      () => sql<Record<string, unknown>[]>`select * from activities where removed_at is null order by at, id`.cursor(batch),
      r => [r["id"], day(r["at"]), r["kind"], r["body"], r["deal_id"] ?? "", r["contact_id"] ?? "", r["company_id"] ?? "", who(r["author"]) || ((r["data"] as Record<string, unknown>)["by"] ?? ""), r["author"]],
    ) };
    yield { name: "next-steps.csv", data: table(
      ["id", "text", "due", "time", "done_at", "deal_id", "contact_id", "owner", "owner_id"],
      () => sql<Record<string, unknown>[]>`select *, to_char(due_on, 'YYYY-MM-DD') as due from steps order by id`.cursor(batch),
      r => [r["id"], r["text"], r["due"], r["due_time"] ?? "", day(r["done_at"]), r["deal_id"] ?? "", r["contact_id"] ?? "", who(r["owner"]), r["owner"] ?? ""],
    ) };
    yield { name: "fields.csv", data: toCsv([["id", "object", "label", "kind", "choices"], ...fields.map(f => [f.id, f.object, f.label, f.kind, f.options.join(" | ")])], true) };
  }
  return zipStream(entries());
}

const encoder = new TextEncoder();
const encode = (text: string) => encoder.encode(text);
