import { keptKeys } from "./seed-words.ts";
import type { Member } from "@argentic/chest-sdk/member";
import { can, canDeleteRecord } from "./access.ts";
import { record } from "./activities.ts";
import { countryCode } from "./countries.ts";
import { customValues, type Custom } from "./custom.ts";
import type { Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import type { FieldDef } from "./custom.ts";
import { fieldClause, listFields, type FieldFilter } from "./fields.ts";
import { clean, email, id, limits, owner as ownerOf, phone, phoneDigits, siren, tags, vat, website } from "./model.ts";
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
  city: string;
  tags: string[];
  owner: string | null;
  contacts: number;
  openDeals: number;
  openValue: number;
  lastActivity: string | null;
};
export type Company = CompanySummary & {
  address: string;
  postcode: string;
  country: string;
  siren: string;
  vat: string;
  email: string;
  notes: string;
  custom: Custom;
  createdBy: string;
  createdAt: string;
};

type Row = { id: string; name: string; website: string; phone: string; industry: string; tags: string[]; owner: string | null; contacts: number; open_deals: number; open_value: string | null; last_activity: Date | null; address: string; postcode: string; city: string; country: string; siren: string; vat: string; email: string; notes: string; custom: Custom; created_by: string; created_at: Date };

const columns = (sql: Query) => sql`
  o.id, o.name, o.website, o.phone, o.industry, o.tags, o.owner, o.address, o.postcode, o.city, o.country, o.siren, o.vat, o.email, o.notes, o.custom, o.created_by, o.created_at,
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
  city: r.city,
  tags: r.tags,
  owner: r.owner,
  contacts: r.contacts,
  openDeals: r.open_deals,
  openValue: Number(r.open_value ?? 0),
  lastActivity: r.last_activity?.toISOString() ?? null,
  address: r.address,
  postcode: r.postcode,
  country: r.country,
  siren: r.siren,
  vat: r.vat,
  email: r.email,
  notes: r.notes,
  custom: r.custom ?? {},
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

// A search that looks like a phone number ("0478421690", "+33 4 78 42"):
// its digits, compared with the stored digits whatever the spacing.
export function phoneQuery(q: string): string | null {
  if (!/^[0-9+().\-/\s]+$/u.test(q)) return null;
  const digits = phoneDigits(q);
  return digits.length >= 4 ? digits : null;
}

// Pages of a list, and its order.
export type Page = { page?: unknown; sort?: unknown };
export const companySorts = ["name", "recent", "created"] as const;
export type CompanySort = (typeof companySorts)[number];
export function pageOf(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 1;
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export type CompanyFilter = { q?: unknown; owner?: OwnerFilter; tag?: unknown; field?: FieldFilter };

function companyWhere(sql: Query, actor: Member, fields: FieldDef[], filter: CompanyFilter) {
  const q = typeof filter.q === "string" ? clean(filter.q, limits.query, { optional: true }) : "";
  const tsq = q ? words(q) : null;
  const digits = q ? phoneQuery(q) : null;
  const tag = typeof filter.tag === "string" && filter.tag !== "" ? filter.tag.slice(0, limits.tag) : null;
  return sql`
    ${ownerClause(sql, "o.owner", filter.owner ?? "", actor)}
    and ${tag ? sql`exists (select 1 from unnest(o.tags) t where lower(t) = lower(${tag}))` : sql`true`}
    and ${fieldClause(sql, "o", fields, filter.field)}
    and ${q ? sql`(${tsq ? sql`o.search @@ to_tsquery('crm', ${tsq}) or` : sql``} o.folded like '%' || crm_fold(${q.replace(/[\\%_]/gu, "")}) || '%' or o.website ilike ${likePattern(q)} or o.city ilike ${likePattern(q)}${digits ? sql` or o.phone_digits like ${"%" + digits + "%"}` : sql``})` : sql`true`}`;
}

export async function listCompanies(sql: Sql, actor: Member | null, filter: CompanyFilter = {}, options: { limit?: number; page?: unknown; sort?: unknown } = {}): Promise<{ rows: Company[]; total: number; page: number; pageSize: number }> {
  reader(actor);
  const limit = options.limit ?? limits.pageSize;
  const page = pageOf(options.page);
  const sort: CompanySort = (companySorts as readonly unknown[]).includes(options.sort) ? options.sort as CompanySort : "name";
  const where = companyWhere(sql, actor!, filter.field ? await listFields(sql, "companies") : [], filter);
  const order = sort === "recent" ? sql`last_activity desc nulls last, o.folded, o.id`
    : sort === "created" ? sql`o.created_at desc, o.id desc`
    : sql`o.folded, o.id`;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from companies o where ${where}`;
  const rows = await sql<Row[]>`select ${columns(sql)} from companies o where ${where} order by ${order} limit ${limit} offset ${(page - 1) * limit}`;
  return { rows: rows.map(toCompany), total: count?.n ?? 0, page, pageSize: limit };
}

// The ids a filter gives, for "select all that match" (bulk actions).
export async function companyIds(sql: Sql, actor: Member | null, filter: CompanyFilter = {}): Promise<string[]> {
  reader(actor);
  const where = companyWhere(sql, actor!, filter.field ? await listFields(sql, "companies") : [], filter);
  return (await sql<{ id: string }[]>`select o.id from companies o where ${where} order by o.folded, o.id limit ${limits.bulk}`).map(r => String(r.id));
}

export async function company(sql: Query, actor: Member | null, companyId: unknown): Promise<Company> {
  reader(actor);
  const [row] = await sql<Row[]>`select ${columns(sql)} from companies o where o.id = ${id(companyId)}`;
  if (!row) throw new AppError("not_found");
  return toCompany(row);
}

// The fields a person writes, checked; only those given change.
export type CompanyInput = { name?: unknown; website?: unknown; phone?: unknown; email?: unknown; address?: unknown; postcode?: unknown; city?: unknown; country?: unknown; siren?: unknown; vat?: unknown; industry?: unknown; notes?: unknown; tags?: unknown; owner?: unknown; custom?: unknown };
function fields(input: CompanyInput) {
  return {
    ...(input.name !== undefined ? { name: clean(input.name, limits.name) } : {}),
    ...(input.website !== undefined ? { website: website(input.website) } : {}),
    ...(input.phone !== undefined ? { phone: phone(input.phone) } : {}),
    ...(input.email !== undefined ? { email: email(input.email) } : {}),
    ...(input.address !== undefined ? { address: clean(input.address, limits.address, { multiline: true, optional: true }) } : {}),
    ...(input.postcode !== undefined ? { postcode: clean(input.postcode, limits.postcode, { optional: true }) } : {}),
    ...(input.city !== undefined ? { city: clean(input.city, limits.city, { optional: true }) } : {}),
    ...(input.country !== undefined ? { country: country(input.country) } : {}),
    ...(input.siren !== undefined ? { siren: siren(input.siren) } : {}),
    ...(input.vat !== undefined ? { vat: vat(input.vat) } : {}),
    ...(input.industry !== undefined ? { industry: clean(input.industry, limits.industry, { optional: true }) } : {}),
    ...(input.notes !== undefined ? { notes: clean(input.notes, limits.notes, { multiline: true, optional: true }) } : {}),
    ...(input.tags !== undefined ? { tags: tags(input.tags) } : {}),
  };
}

// A country: its code when it is one we know, else as written.
function country(value: unknown): string {
  const text = clean(value, limits.country, { optional: true });
  return countryCode(text) ?? text;
}

// addCompany: its owner is the one who adds it, unless they give it (a
// manager or a salesperson) to someone of the team.
export async function addCompany(sql: Sql, actor: Member | null, input: CompanyInput): Promise<{ id: string; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const f = fields({ ...input, name: input.name ?? "" });
  const custom = customValues(await listFields(sql, "companies"), {}, input.custom);
  const owner = input.owner === undefined ? actor!.id : ownerOf(input.owner);
  await checkAssignable(owner, actor!.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into companies (name, website, phone, email, address, postcode, city, country, siren, vat, industry, notes, tags, custom, owner, created_by)
      values (${f.name!}, ${f.website ?? ""}, ${f.phone ?? ""}, ${f.email ?? ""}, ${f.address ?? ""}, ${f.postcode ?? ""}, ${f.city ?? ""}, ${f.country ?? ""}, ${f.siren ?? ""}, ${f.vat ?? ""},
        ${f.industry ?? ""}, ${f.notes ?? ""}, ${f.tags ?? []}, ${tx.json(custom)}, ${owner}, ${actor!.id})
      returning id`;
    await record(tx, "created", actor!.id, { companyId: String(row!.id) });
    return { id: String(row!.id), name: f.name! };
  });
}

export async function updateCompany(sql: Sql, actor: Member | null, companyId: unknown, input: CompanyInput): Promise<{ ownerChanged: { from: string | null; to: string | null } | null; name: string }> {
  if (!can(actor, "records.write")) throw new AppError("forbidden");
  const current = await company(sql, actor, companyId);
  const f = fields(input);
  const custom = customValues(await listFields(sql, "companies"), current.custom, input.custom);
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
  // Seeded names the form showed in the reader's language keep their keys.
  next.industry = keptKeys("industries", [current.industry], [next.industry])[0]!;
  next.tags = keptKeys("tags", current.tags, next.tags);
  await sql`
    update companies set name = ${next.name}, website = ${next.website}, phone = ${next.phone}, email = ${next.email}, address = ${next.address}, postcode = ${next.postcode},
      city = ${next.city}, country = ${next.country}, siren = ${next.siren}, vat = ${next.vat}, industry = ${next.industry},
      notes = ${next.notes}, tags = ${next.tags}, custom = ${sql.json(custom)}, owner = ${owner}, updated_at = now()
    where id = ${current.id}`;
  return { ownerChanged: owner !== current.owner ? { from: current.owner, to: owner } : null, name: next.name };
}

// deleteCompany deletes it for good, with what was logged only on it and
// its files; its contacts and deals stay, without a company. Says which
// stored files to delete from the Chest.
export async function deleteCompany(sql: Sql, actor: Member | null, companyId: unknown): Promise<{ objects: string[] }> {
  const current = await company(sql, actor, companyId);
  if (!canDeleteRecord(actor, current)) throw new AppError("forbidden");
  return sql.begin(async tx => {
    const objects = (await tx<{ object: string }[]>`select object from attachments where company_id = ${current.id}`).map(r => r.object);
    await tx`delete from activities where company_id = ${current.id} and deal_id is null and contact_id is null`;
    await tx`delete from companies where id = ${current.id}`;
    return { objects };
  });
}

// The companies a picker offers as one types: close names first, then by
// name; the first ones when nothing is typed.
export async function companyChoices(sql: Sql, actor: Member | null, q: unknown = "", limit = 8): Promise<{ id: string; name: string; detail: string }[]> {
  reader(actor);
  const text = typeof q === "string" ? q.slice(0, limits.query).trim().replace(/[\\%_]/gu, "") : "";
  const rows = await sql<{ id: string; name: string; detail: string }[]>`
    select id, name, concat_ws(' · ', nullif(city, ''), nullif(website, '')) as detail from companies
    ${text ? sql`where folded like '%' || crm_fold(${text}) || '%' or word_similarity(crm_fold(${text}), folded) > 0.5` : sql``}
    order by ${text ? sql`(folded like crm_fold(${text}) || '%') desc, word_similarity(crm_fold(${text}), folded) desc,` : sql``} folded, id limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), name: r.name, detail: r.detail }));
}

// All the tags in use, for the filters.
export async function tagsInUse(sql: Sql, table: "companies" | "contacts"): Promise<string[]> {
  const rows = await sql<{ tag: string }[]>`select distinct on (lower(t)) t as tag from ${sql(table)}, unnest(tags) t order by lower(t) limit 200`;
  return rows.map(r => r.tag);
}
