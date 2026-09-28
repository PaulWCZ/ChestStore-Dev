import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord } from "./access.ts";
import { record } from "./activities.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, id, limits, owner as ownerOf, phone, tags, website } from "./model.ts";
import { checkAssignable } from "./team.ts";

// Companies: the clients and prospects, their people (contacts) and their
// deals. Everyone who has a role reads them all; salespeople and managers
// add and change them; a manager or the owner deletes one.

export type CompanySummary = {
  id: string;
  name: string;
  website: string;
  phone: string;
  industry: string;
  tags: string[];
  owner: string | null;
  contacts: number;
  openDeals: number;
  openValue: number;
  lastActivity: string | null;
};
export type Company = CompanySummary & { address: string; notes: string; createdBy: string; createdAt: string };

type Row = { id: string; name: string; website: string; phone: string; industry: string; tags: string[]; owner: string | null; contacts: number; open_deals: number; open_value: string | null; last_activity: Date | null; address: string; notes: string; created_by: string; created_at: Date };

const columns = (sql: Query) => sql`
  o.id, o.name, o.website, o.phone, o.industry, o.tags, o.owner, o.address, o.notes, o.created_by, o.created_at,
  (select count(*)::int from contacts c where c.company_id = o.id) as contacts,
  (select count(*)::int from deals d join stages s on s.id = d.stage_id where d.company_id = o.id and s.kind = 'open') as open_deals,
  (select sum(d.value_cents) from deals d join stages s on s.id = d.stage_id where d.company_id = o.id and s.kind = 'open') as open_value,
  (select max(a.at) from activities a where a.company_id = o.id and a.removed_at is null) as last_activity`;

const toCompany = (r: Row): Company => ({
  id: String(r.id),
  name: r.name,
  website: r.website,
  phone: r.phone,
  industry: r.industry,
  tags: r.tags,
  owner: r.owner,
  contacts: r.contacts,
  openDeals: r.open_deals,
  openValue: Number(r.open_value ?? 0),
  lastActivity: r.last_activity?.toISOString() ?? null,
  address: r.address,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at.toISOString(),
});

function reader(actor: Member | null): void {
  if (!can(actor, "read")) throw new AppError("forbidden");
}

// The owner filter of a list: everyone, mine, nobody's, or someone's.
export type OwnerFilter = "" | "me" | "none" | string;
export function ownerClause(sql: Query, column: string, filter: OwnerFilter, actor: Member) {
  if (filter === "me") return sql`${sql(column)} = ${actor.id}`;
  if (filter === "none") return sql`${sql(column)} is null`;
  if (/^mbr_[a-z2-7]{26}$/u.test(filter)) return sql`${sql(column)} = ${filter}`;
  return sql`true`;
}

// The words of a search, for a prefix query ("acm" finds "Acme").
export function words(q: string): string | null {
  const list = q.split(/\s+/u).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 8);
  return list.length ? list.map(w => w + ":*").join(" & ") : null;
}
export const likePattern = (q: string) => "%" + q.replace(/[\\%_]/gu, "\\$&") + "%";

export async function listCompanies(sql: Sql, actor: Member | null, filter: { q?: unknown; owner?: OwnerFilter; tag?: unknown } = {}, limit = 300): Promise<{ rows: CompanySummary[]; total: number }> {
  reader(actor);
  const q = typeof filter.q === "string" ? clean(filter.q, limits.query, { optional: true }) : "";
  const tsq = q ? words(q) : null;
  const tag = typeof filter.tag === "string" && filter.tag !== "" ? filter.tag.slice(0, limits.tag) : null;
  const where = sql`
    ${ownerClause(sql, "o.owner", filter.owner ?? "", actor!)}
    and ${tag ? sql`exists (select 1 from unnest(o.tags) t where lower(t) = lower(${tag}))` : sql`true`}
    and ${q ? sql`(${tsq ? sql`o.search @@ to_tsquery('crm', ${tsq}) or` : sql``} o.folded like '%' || crm_fold(${q.replace(/[\\%_]/gu, "")}) || '%' or o.website ilike ${likePattern(q)} or o.phone ilike ${likePattern(q)})` : sql`true`}`;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from companies o where ${where}`;
  const rows = await sql<Row[]>`select ${columns(sql)} from companies o where ${where} order by o.folded, o.id limit ${limit}`;
  return { rows: rows.map(toCompany), total: count?.n ?? 0 };
}

export async function company(sql: Query, actor: Member | null, companyId: unknown): Promise<Company> {
  reader(actor);
  const [row] = await sql<Row[]>`select ${columns(sql)} from companies o where o.id = ${id(companyId)}`;
  if (!row) throw new AppError("not_found");
  return toCompany(row);
}

// The fields a person writes, checked; only those given change.
type Input = { name?: unknown; website?: unknown; phone?: unknown; address?: unknown; industry?: unknown; notes?: unknown; tags?: unknown; owner?: unknown };
function fields(input: Input) {
  return {
    ...(input.name !== undefined ? { name: clean(input.name, limits.name) } : {}),
    ...(input.website !== undefined ? { website: website(input.website) } : {}),
    ...(input.phone !== undefined ? { phone: phone(input.phone) } : {}),
    ...(input.address !== undefined ? { address: clean(input.address, limits.address, { multiline: true, optional: true }) } : {}),
    ...(input.industry !== undefined ? { industry: clean(input.industry, limits.industry, { optional: true }) } : {}),
    ...(input.notes !== undefined ? { notes: clean(input.notes, limits.notes, { multiline: true, optional: true }) } : {}),
    ...(input.tags !== undefined ? { tags: tags(input.tags) } : {}),
  };
}

// addCompany: its owner is the one who adds it, unless they give it (a
// manager or a salesperson) to someone of the team.
export async function addCompany(sql: Sql, actor: Member | null, input: Input): Promise<{ id: string; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const f = fields({ ...input, name: input.name ?? "" });
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  await checkAssignable(owner, actor!.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into companies (name, website, phone, address, industry, notes, tags, owner, created_by)
      values (${f.name!}, ${f.website ?? ""}, ${f.phone ?? ""}, ${f.address ?? ""}, ${f.industry ?? ""}, ${f.notes ?? ""}, ${f.tags ?? []}, ${owner}, ${actor!.id})
      returning id`;
    await record(tx, "created", actor!.id, { companyId: String(row!.id) });
    return { id: String(row!.id), name: f.name! };
  });
}

export async function updateCompany(sql: Sql, actor: Member | null, companyId: unknown, input: Input): Promise<{ ownerChanged: { from: string | null; to: string | null } | null; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const current = await company(sql, actor, companyId);
  const f = fields(input);
  let owner = current.owner;
  if (input.owner !== undefined) {
    owner = ownerOf(input.owner);
    if (owner !== current.owner) {
      // Giving to someone else, or to nobody: someone who may assign.
      if (owner !== actor!.id && !can(actor, "assign")) throw new AppError("forbidden");
      await checkAssignable(owner, actor!.id);
    }
  }
  const next = { ...current, ...f };
  await sql`
    update companies set name = ${next.name}, website = ${next.website}, phone = ${next.phone}, address = ${next.address}, industry = ${next.industry},
      notes = ${next.notes}, tags = ${next.tags}, owner = ${owner}, updated_at = now()
    where id = ${current.id}`;
  return { ownerChanged: owner !== current.owner ? { from: current.owner, to: owner } : null, name: next.name };
}

// deleteCompany deletes it for good, with what was logged only on it; its
// contacts and deals stay, without a company.
export async function deleteCompany(sql: Sql, actor: Member | null, companyId: unknown): Promise<void> {
  const current = await company(sql, actor, companyId);
  if (!canDeleteRecord(actor, current)) throw new AppError("forbidden");
  await sql.begin(async tx => {
    await tx`delete from activities where company_id = ${current.id} and deal_id is null and contact_id is null`;
    await tx`delete from companies where id = ${current.id}`;
  });
}

// The companies a picker offers, by name.
export async function companyChoices(sql: Sql, actor: Member | null, q: unknown = ""): Promise<{ id: string; name: string }[]> {
  reader(actor);
  const text = typeof q === "string" ? q.slice(0, limits.query).trim() : "";
  const rows = await sql<{ id: string; name: string }[]>`
    select id, name from companies ${text ? sql`where folded like '%' || crm_fold(${text.replace(/[\\%_]/gu, "")}) || '%'` : sql``}
    order by folded, id limit 1000`;
  return rows.map(r => ({ id: String(r.id), name: r.name }));
}

// All the tags in use, for the filters.
export async function tagsInUse(sql: Sql, table: "companies" | "contacts"): Promise<string[]> {
  const rows = await sql<{ tag: string }[]>`select distinct on (lower(t)) t as tag from ${sql(table)}, unnest(tags) t order by lower(t) limit 200`;
  return rows.map(r => r.tag);
}
