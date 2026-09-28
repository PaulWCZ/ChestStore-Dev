import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord } from "./access.ts";
import { record, timeline, type Activity } from "./activities.ts";
import { likePattern, ownerClause, words, type OwnerFilter } from "./companies.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, email, id, limits, optionalId, owner as ownerOf, phone, tags } from "./model.ts";
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
  title: string;
  company: { id: string; name: string } | null;
  tags: string[];
  owner: string | null;
  lastContact: string | null;
  step: Step | null;
};
export type Contact = ContactSummary & { notes: string; createdBy: string; createdAt: string; updatedAt: string };

type Row = { id: string; name: string; email: string; phone: string; title: string; company_id: string | null; company_name: string | null; tags: string[]; owner: string | null; last_contact_at: Date | null; notes: string; created_by: string; created_at: Date; updated_at: Date; step: Parameters<typeof toStep>[0] | null };

const columns = (sql: Query) => sql`
  c.id, c.name, c.email, c.phone, c.title, c.company_id, o.name as company_name, c.tags, c.owner, c.last_contact_at, c.notes, c.created_by, c.created_at, c.updated_at,
  (select row_to_json(x) from (select ${stepColumns(sql)} from steps p where p.contact_id = c.id and p.done_at is null) x) as step`;

const toContact = (r: Row): Contact => ({
  id: String(r.id),
  name: r.name,
  email: r.email,
  phone: r.phone,
  title: r.title,
  company: r.company_id ? { id: String(r.company_id), name: r.company_name ?? "" } : null,
  tags: r.tags,
  owner: r.owner,
  lastContact: r.last_contact_at?.toISOString() ?? null,
  step: r.step ? toStep(r.step) : null,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

function reader(actor: Member | null): void {
  if (!can(actor, "read")) throw new AppError("forbidden");
}

// stale: no contact for three years (or never, and added three years ago).
export async function listContacts(sql: Sql, actor: Member | null, filter: { q?: unknown; owner?: OwnerFilter; tag?: unknown; company?: unknown; stale?: boolean } = {}, limit = 300): Promise<{ rows: ContactSummary[]; total: number }> {
  reader(actor);
  const q = typeof filter.q === "string" ? clean(filter.q, limits.query, { optional: true }) : "";
  const tsq = q ? words(q) : null;
  const tag = typeof filter.tag === "string" && filter.tag !== "" ? filter.tag.slice(0, limits.tag) : null;
  const companyId = optionalId(filter.company ?? null);
  const where = sql`
    ${ownerClause(sql, "c.owner", filter.owner ?? "", actor!)}
    and ${tag ? sql`exists (select 1 from unnest(c.tags) t where lower(t) = lower(${tag}))` : sql`true`}
    and ${companyId ? sql`c.company_id = ${companyId}` : sql`true`}
    and ${filter.stale ? sql`coalesce(c.last_contact_at, c.created_at) < now() - interval '3 years'` : sql`true`}
    and ${q ? sql`(${tsq ? sql`c.search @@ to_tsquery('crm', ${tsq}) or` : sql``} c.folded like '%' || crm_fold(${q.replace(/[\\%_]/gu, "")}) || '%' or c.email ilike ${likePattern(q)} or c.phone ilike ${likePattern(q)})` : sql`true`}`;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from contacts c where ${where}`;
  const rows = await sql<Row[]>`select ${columns(sql)} from contacts c left join companies o on o.id = c.company_id where ${where} order by c.folded, c.id limit ${limit}`;
  return { rows: rows.map(toContact), total: count?.n ?? 0 };
}

export async function contact(sql: Query, actor: Member | null, contactId: unknown): Promise<Contact> {
  reader(actor);
  const [row] = await sql<Row[]>`select ${columns(sql)} from contacts c left join companies o on o.id = c.company_id where c.id = ${id(contactId)}`;
  if (!row) throw new AppError("not_found");
  return toContact(row);
}

type Input = { name?: unknown; email?: unknown; phone?: unknown; title?: unknown; company?: unknown; notes?: unknown; tags?: unknown; owner?: unknown };

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
    ...(input.title !== undefined ? { title: clean(input.title, limits.title, { optional: true }) } : {}),
    ...(input.notes !== undefined ? { notes: clean(input.notes, limits.notes, { multiline: true, optional: true }) } : {}),
    ...(input.tags !== undefined ? { tags: tags(input.tags) } : {}),
    ...(companyId !== undefined ? { companyId } : {}),
  };
}

export async function addContact(sql: Sql, actor: Member | null, input: Input): Promise<{ id: string; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const f = await fields(sql, { ...input, name: input.name ?? "" });
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  await checkAssignable(owner, actor!.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into contacts (name, email, phone, title, company_id, notes, tags, owner, created_by)
      values (${f.name!}, ${f.email ?? ""}, ${f.phone ?? ""}, ${f.title ?? ""}, ${f.companyId ?? null}, ${f.notes ?? ""}, ${f.tags ?? []}, ${owner}, ${actor!.id})
      returning id`;
    await record(tx, "created", actor!.id, { contactId: String(row!.id), companyId: f.companyId ?? null });
    return { id: String(row!.id), name: f.name! };
  });
}

export async function updateContact(sql: Sql, actor: Member | null, contactId: unknown, input: Input): Promise<{ ownerChanged: { from: string | null; to: string | null } | null; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const current = await contact(sql, actor, contactId);
  const f = await fields(sql, input);
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
    title: f.title ?? current.title,
    notes: f.notes ?? current.notes,
    tags: f.tags ?? current.tags,
    companyId: f.companyId === undefined ? current.company?.id ?? null : f.companyId,
  };
  await sql`
    update contacts set name = ${next.name}, email = ${next.email}, phone = ${next.phone}, title = ${next.title}, notes = ${next.notes}, tags = ${next.tags},
      company_id = ${next.companyId}, owner = ${owner}, updated_at = now()
    where id = ${current.id}`;
  return { ownerChanged: owner !== current.owner ? { from: current.owner, to: owner } : null, name: next.name };
}

// deleteContact forgets a person for good (GDPR): the contact, every
// activity that names them (with what was written in it), their next
// step; their deals stay, without them. Nothing to undo: that is the point.
export async function deleteContact(sql: Sql, actor: Member | null, contactId: unknown): Promise<{ stepOwner: string | null; stepId: string | null }> {
  const current = await contact(sql, actor, contactId);
  if (!canDeleteRecord(actor, current)) throw new AppError("forbidden");
  await sql.begin(async tx => {
    await tx`delete from activities where contact_id = ${current.id}`;
    await tx`delete from steps where contact_id = ${current.id}`;
    await tx`update deals set contact_id = null where contact_id = ${current.id}`;
    await tx`delete from contacts where id = ${current.id}`;
  });
  return { stepOwner: current.step?.owner ?? null, stepId: current.step?.id ?? null };
}

// The people a picker offers (a deal's contact), by name, with their company.
export async function contactChoices(sql: Sql, actor: Member | null): Promise<{ id: string; name: string; companyId: string | null }[]> {
  reader(actor);
  const rows = await sql<{ id: string; name: string; company_id: string | null }[]>`select id, name, company_id from contacts order by folded, id limit 2000`;
  return rows.map(r => ({ id: String(r.id), name: r.name, companyId: r.company_id ? String(r.company_id) : null }));
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
  };
}
