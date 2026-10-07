import { keptKeys } from "./seed-words.ts";
import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord } from "./access.ts";
import { record, timeline, type Activity } from "./activities.ts";
import { likePattern, ownerClause, pageOf, phoneQuery, words, type OwnerFilter } from "./companies.ts";
import { customValues, type Custom } from "../shared/custom.ts";
import type { FieldDef } from "../shared/custom.ts";
import { fieldClause, listFields, type FieldFilter } from "./fields.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, limits, optionalId, owner as ownerOf, phone, tags, website } from "../shared/model.ts";
import { email } from "./email.ts";
import { stepColumns, toStep, type Step } from "./steps.ts";
import { checkAssignable } from "./team.ts";

// Contacts: the people the team deals with, at a company or on their own.
// They are personal data of people outside the company (GDPR): one contact
// can be exported whole, and deleted for good with what was written about
// them. The CNIL's rule for prospects — three years after the last contact
// coming from them — is helped by last_contact_at and the "no contact for
// three years" list.

export type ContactSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  phone2: string;
  title: string;
  company: { id: string; name: string } | null;
  tags: string[];
  owner: string | null;
  lastContact: string | null;
  // The next open step (the soonest), and how many are open.
  step: Step | null;
  steps: number;
};
export type Contact = ContactSummary & { url: string; notes: string; custom: Custom; createdBy: string; createdAt: string; updatedAt: string };

type Row = { id: string; name: string; email: string; phone: string; phone2: string; url: string; custom: Custom; open_steps: number; title: string; company_id: string | null; company_name: string | null; tags: string[]; owner: string | null; last_contact_at: Date | null; notes: string; created_by: string; created_at: Date; updated_at: Date; step: Parameters<typeof toStep>[0] | null };

const columns = (sql: Query) => sql`
  c.id, c.name, c.email, c.phone, c.phone2, c.url, c.custom, c.title, c.company_id, o.name as company_name, c.tags, c.owner, c.last_contact_at, c.notes, c.created_by, c.created_at, c.updated_at,
  (select row_to_json(x) from (select ${stepColumns(sql)} from steps p where p.contact_id = c.id and p.done_at is null order by p.due_on, p.due_time nulls last, p.id limit 1) x) as step,
  (select count(*)::int from steps p where p.contact_id = c.id and p.done_at is null) as open_steps`;

const toContact = (r: Row): Contact => ({
  id: String(r.id),
  name: r.name,
  email: r.email,
  phone: r.phone,
  phone2: r.phone2,
  url: r.url,
  custom: r.custom ?? {},
  title: r.title,
  company: r.company_id ? { id: String(r.company_id), name: r.company_name ?? "" } : null,
  tags: r.tags,
  owner: r.owner,
  lastContact: r.last_contact_at?.toISOString() ?? null,
  step: r.step ? toStep(r.step) : null,
  steps: r.open_steps,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

function reader(actor: Member | null): void {
  if (!can(actor, "read")) throw new AppError("forbidden");
}

export const contactSorts = ["name", "last", "created"] as const;
export type ContactSort = (typeof contactSorts)[number];
export type ContactFilter = { q?: unknown; owner?: OwnerFilter; tag?: unknown; company?: unknown; stale?: boolean; field?: FieldFilter };

// stale: no contact for three years (or never, and added three years ago).
function contactWhere(sql: Query, actor: Member, fields: FieldDef[], filter: ContactFilter) {
  const q = typeof filter.q === "string" ? clean(filter.q, limits.query, { optional: true }) : "";
  const tsq = q ? words(q) : null;
  const digits = q ? phoneQuery(q) : null;
  const tag = typeof filter.tag === "string" && filter.tag !== "" ? filter.tag.slice(0, limits.tag) : null;
  const companyId = optionalId(filter.company ?? null);
  return sql`
    ${ownerClause(sql, "c.owner", filter.owner ?? "", actor)}
    and ${tag ? sql`exists (select 1 from unnest(c.tags) t where lower(t) = lower(${tag}))` : sql`true`}
    and ${companyId ? sql`c.company_id = ${companyId}` : sql`true`}
    and ${filter.stale ? sql`coalesce(c.last_contact_at, c.created_at) < now() - interval '3 years'` : sql`true`}
    and ${fieldClause(sql, "c", fields, filter.field)}
    and ${q ? sql`(${tsq ? sql`c.search @@ to_tsquery('crm', ${tsq}) or` : sql``} c.folded like '%' || crm_fold(${q.replace(/[\\%_]/gu, "")}) || '%' or c.email ilike ${likePattern(q)}${digits ? sql` or c.phone_digits like ${"%" + digits + "%"}` : sql``})` : sql`true`}`;
}

export async function listContacts(sql: Sql, actor: Member | null, filter: ContactFilter = {}, options: { limit?: number; page?: unknown; sort?: unknown } = {}): Promise<{ rows: Contact[]; total: number; page: number; pageSize: number }> {
  reader(actor);
  const limit = options.limit ?? limits.pageSize;
  const page = pageOf(options.page);
  const sort: ContactSort = (contactSorts as readonly unknown[]).includes(options.sort) ? options.sort as ContactSort : "name";
  const where = contactWhere(sql, actor!, filter.field ? await listFields(sql, "contacts") : [], filter);
  const order = sort === "last" ? sql`c.last_contact_at desc nulls last, c.folded, c.id`
    : sort === "created" ? sql`c.created_at desc, c.id desc`
    : sql`c.folded, c.id`;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from contacts c where ${where}`;
  const rows = await sql<Row[]>`select ${columns(sql)} from contacts c left join companies o on o.id = c.company_id where ${where} order by ${order} limit ${limit} offset ${(page - 1) * limit}`;
  return { rows: rows.map(toContact), total: count?.n ?? 0, page, pageSize: limit };
}

// Every contact a filter gives, by name, a batch at a time (a cursor), and
// the owners they name (asked once, before the rows).
export async function contactStream(sql: Sql, actor: Member | null, filter: ContactFilter = {}, batch = 500): Promise<{ owners: (string | null)[]; batches: AsyncIterable<Contact[]> }> {
  reader(actor);
  const where = contactWhere(sql, actor!, filter.field ? await listFields(sql, "contacts") : [], filter);
  const owners = (await sql<{ owner: string | null }[]>`select distinct c.owner from contacts c where ${where}`).map(r => r.owner);
  async function* batches() {
    for await (const rows of sql<Row[]>`select ${columns(sql)} from contacts c left join companies o on o.id = c.company_id where ${where} order by c.folded, c.id`.cursor(batch)) yield rows.map(toContact);
  }
  return { owners, batches: batches() };
}

// The ids a filter gives, for "select all that match" (bulk actions).
export async function contactIds(sql: Sql, actor: Member | null, filter: ContactFilter = {}): Promise<string[]> {
  reader(actor);
  const where = contactWhere(sql, actor!, filter.field ? await listFields(sql, "contacts") : [], filter);
  return (await sql<{ id: string }[]>`select c.id from contacts c where ${where} order by c.folded, c.id limit ${limits.bulk}`).map(r => String(r.id));
}

export async function contact(sql: Query, actor: Member | null, contactId: unknown): Promise<Contact> {
  reader(actor);
  const [row] = await sql<Row[]>`select ${columns(sql)} from contacts c left join companies o on o.id = c.company_id where c.id = ${id(contactId)}`;
  if (!row) throw new AppError("not_found");
  return toContact(row);
}

export type ContactInput = { name?: unknown; email?: unknown; phone?: unknown; phone2?: unknown; url?: unknown; title?: unknown; company?: unknown; notes?: unknown; tags?: unknown; owner?: unknown; custom?: unknown };
type Input = ContactInput;

async function fields(sql: Query, input: Input) {
  let companyId: string | null | undefined;
  if (input.company !== undefined) {
    companyId = optionalId(input.company);
    if (companyId) {
      const [c] = await sql`select 1 from companies where id = ${companyId}`;
      if (!c) throw new AppError("not_found");
    }
  }
  return {
    ...(input.name !== undefined ? { name: clean(input.name, limits.name) } : {}),
    ...(input.email !== undefined ? { email: email(input.email) } : {}),
    ...(input.phone !== undefined ? { phone: phone(input.phone) } : {}),
    ...(input.phone2 !== undefined ? { phone2: phone(input.phone2) } : {}),
    ...(input.url !== undefined ? { url: website(input.url) } : {}),
    ...(input.title !== undefined ? { title: clean(input.title, limits.title, { optional: true }) } : {}),
    ...(input.notes !== undefined ? { notes: clean(input.notes, limits.notes, { multiline: true, optional: true }) } : {}),
    ...(input.tags !== undefined ? { tags: tags(input.tags) } : {}),
    ...(companyId !== undefined ? { companyId } : {}),
  };
}

export async function addContact(sql: Sql, actor: Member | null, input: Input): Promise<{ id: string; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const f = await fields(sql, { ...input, name: input.name ?? "" });
  const custom = customValues(await listFields(sql, "contacts"), {}, input.custom);
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  await checkAssignable(owner, actor!.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into contacts (name, email, phone, phone2, url, title, company_id, notes, tags, custom, owner, created_by)
      values (${f.name!}, ${f.email ?? ""}, ${f.phone ?? ""}, ${f.phone2 ?? ""}, ${f.url ?? ""}, ${f.title ?? ""}, ${f.companyId ?? null}, ${f.notes ?? ""}, ${f.tags ?? []}, ${tx.json(custom)}, ${owner}, ${actor!.id})
      returning id`;
    await record(tx, "created", actor!.id, { contactId: String(row!.id), companyId: f.companyId ?? null });
    return { id: String(row!.id), name: f.name! };
  });
}

export async function updateContact(sql: Sql, actor: Member | null, contactId: unknown, input: Input): Promise<{ ownerChanged: { from: string | null; to: string | null } | null; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const current = await contact(sql, actor, contactId);
  const f = await fields(sql, input);
  const custom = customValues(await listFields(sql, "contacts"), current.custom, input.custom);
  let owner = current.owner;
  if (input.owner !== undefined) {
    owner = ownerOf(input.owner);
    if (owner !== current.owner) {
      if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
      await checkAssignable(owner, actor!.id);
    }
  }
  const next = {
    name: f.name ?? current.name,
    email: f.email ?? current.email,
    phone: f.phone ?? current.phone,
    phone2: f.phone2 ?? current.phone2,
    url: f.url ?? current.url,
    title: f.title ?? current.title,
    notes: f.notes ?? current.notes,
    // Seeded tags the form showed in the reader's language keep their keys.
    tags: keptKeys("tags", current.tags, f.tags ?? current.tags),
    companyId: f.companyId === undefined ? current.company?.id ?? null : f.companyId,
  };
  await sql`
    update contacts set name = ${next.name}, email = ${next.email}, phone = ${next.phone}, phone2 = ${next.phone2}, url = ${next.url}, custom = ${sql.json(custom)}, title = ${next.title}, notes = ${next.notes}, tags = ${next.tags},
      company_id = ${next.companyId}, owner = ${owner}, updated_at = now()
    where id = ${current.id}`;
  return { ownerChanged: owner !== current.owner ? { from: current.owner, to: owner } : null, name: next.name };
}

// deleteContact forgets a person for good (GDPR): the contact, every
// activity that names them (with what was written in it), their next
// steps, their files; their deals stay, without them. Nothing to undo: that
// is the point. Says whose steps went (to settle their bell) and which
// stored files to delete from the Chest.
export async function deleteContact(sql: Sql, actor: Member | null, contactId: unknown): Promise<{ steps: { id: string; owner: string | null }[]; objects: string[] }> {
  const current = await contact(sql, actor, contactId);
  if (!canDeleteRecord(actor, current)) throw new AppError("forbidden");
  return sql.begin(async tx => forget(tx, current.id));
}

// forget: what deleting a person removes, inside a transaction (also used
// by bulk delete and by undoing an import).
export async function forget(tx: Query, contactId: string): Promise<{ steps: { id: string; owner: string | null }[]; objects: string[] }> {
  const steps = await tx<{ id: string; owner: string | null }[]>`delete from steps where contact_id = ${contactId} returning id, owner`;
  const objects = (await tx<{ object: string }[]>`select object from attachments where contact_id = ${contactId}`).map(r => r.object);
  await tx`delete from activities where contact_id = ${contactId}`;
  await tx`update deals set contact_id = null where contact_id = ${contactId}`;
  await tx`delete from contacts where id = ${contactId}`;
  return { steps: steps.map(s => ({ id: String(s.id), owner: s.owner })), objects };
}

// The people a picker offers as one types (a deal's contact): of the
// chosen company and people of no company when a company is chosen.
export async function contactChoices(sql: Sql, actor: Member | null, q: unknown = "", companyId: unknown = null, limit = 8): Promise<{ id: string; name: string; detail: string; companyId: string | null; companyName: string | null }[]> {
  reader(actor);
  const text = typeof q === "string" ? q.slice(0, limits.query).trim().replace(/[\\%_]/gu, "") : "";
  const company = optionalId(companyId);
  const rows = await sql<{ id: string; name: string; detail: string; company_id: string | null; company_name: string | null }[]>`
    select c.id, c.name, concat_ws(' · ', nullif(c.title, ''), o.name, nullif(c.email, '')) as detail, c.company_id, o.name as company_name
    from contacts c left join companies o on o.id = c.company_id
    where ${company ? sql`(c.company_id = ${company} or c.company_id is null)` : sql`true`}
      and ${text ? sql`(c.folded like '%' || crm_fold(${text}) || '%' or word_similarity(crm_fold(${text}), c.folded) > 0.5 or c.email ilike ${"%" + text + "%"})` : sql`true`}
    order by ${company ? sql`(c.company_id is not null) desc,` : sql``} ${text ? sql`(c.folded like crm_fold(${text}) || '%') desc, word_similarity(crm_fold(${text}), c.folded) desc,` : sql``} c.folded, c.id
    limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), name: r.name, detail: r.detail, companyId: r.company_id ? String(r.company_id) : null, companyName: r.company_name }));
}

// exportContact: everything the tool holds about one person, for their
// right of access (GDPR art. 15): the record, their deals, what was logged
// about them, their next steps. Team members are ids here; the route puts
// names on them.
export type ContactExport = {
  contact: Contact;
  deals: { id: string; title: string; valueCents: number; stage: string; createdAt: string }[];
  activities: Activity[];
  steps: (Step & { doneAt: string | null })[];
  files: { name: string; type: string; size: number; addedAt: string }[];
};
export async function exportContact(sql: Sql, actor: Member | null, contactId: unknown): Promise<ContactExport> {
  const c = await contact(sql, actor, contactId);
  const deals = await sql<{ id: string; title: string; value_cents: string; stage: string; created_at: Date }[]>`
    select d.id, d.title, d.value_cents, coalesce(s.name, s.key) as stage, d.created_at from deals d join stages s on s.id = d.stage_id where d.contact_id = ${c.id} order by d.created_at`;
  const steps = await sql<(Parameters<typeof toStep>[0] & { done_at: Date | null })[]>`select ${stepColumns(sql)}, p.done_at from steps p where p.contact_id = ${c.id} order by p.created_at`;
  return {
    contact: c,
    deals: deals.map(d => ({ id: String(d.id), title: d.title, valueCents: Number(d.value_cents), stage: d.stage, createdAt: d.created_at.toISOString() })),
    activities: await timeline(sql, { contactId: c.id }, 5000),
    steps: steps.map(s => ({ ...toStep(s), doneAt: s.done_at?.toISOString() ?? null })),
    files: (await sql<{ file_name: string; type: string; size: string; added_at: Date }[]>`select file_name, type, size, added_at from attachments where contact_id = ${c.id} order by added_at`).map(f => ({ name: f.file_name, type: f.type, size: Number(f.size), addedAt: f.added_at.toISOString() })),
  };
}
