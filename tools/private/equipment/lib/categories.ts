import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isIcon, isKind, limits, optional, type CategoryKey, type IconName, type Kind } from "./model.ts";

// Categories: the eight built-in ones (named by the reader's catalogue until
// a manager renames them) and the company's own. A category of kind
// "licence" holds licences and subscriptions, with seats; one of kind
// "consumable" holds things counted in bulk (cables, toner), with a
// quantity.
// membersSee: whether members (not managers) see who holds its items
// (off by default for keys and badges and for vehicles: security
// information). A member always sees their own.
export type Category = { id: string; key: CategoryKey | null; name: string | null; icon: IconName; kind: Kind; membersSee: boolean };
// For a category of things counted in bulk, inStock is the number of units
// and low the items at or under their minimum.
export type CategoryCount = Category & { total: number; inStock: number; inUse: number; inRepair: number; low: number };

type Row = { id: string; key: CategoryKey | null; name: string | null; icon: IconName; kind: Kind; members_see: boolean };
const shape = (r: Row): Category => ({ id: String(r.id), key: r.key, name: r.name, icon: r.icon, kind: r.kind, membersSee: r.members_see });

function manager(actor: Member | null): Member {
  if (!actor || !can(actor, "items.manage")) throw new AppError("forbidden");
  return actor;
}

export async function listCategories(sql: Query, actor: Member | null): Promise<Category[]> {
  if (!can(actor, "items.browse")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`select id, key, name, icon, kind, members_see from categories where removed_at is null order by position, id`;
  return rows.map(shape);
}

// Every category with its stock: how many items, in stock, in use, in repair
// (retired and lost ones are not counted as stock).
export async function categoryCounts(sql: Query, actor: Member | null): Promise<CategoryCount[]> {
  if (!can(actor, "items.browse")) throw new AppError("forbidden");
  const rows = await sql<(Row & { total: number; in_stock: number; in_use: number; in_repair: number; units: number; low: number })[]>`
    select c.id, c.key, c.name, c.icon, c.kind, c.members_see,
      count(i.id) filter (where i.status not in ('retired', 'lost'))::int as total,
      count(i.id) filter (where i.status = 'in_stock')::int as in_stock,
      count(i.id) filter (where i.status = 'in_use')::int as in_use,
      count(i.id) filter (where i.status = 'in_repair')::int as in_repair,
      coalesce(sum(i.quantity) filter (where i.status <> 'retired'), 0)::int as units,
      count(i.id) filter (where i.status <> 'retired' and i.min_quantity is not null and i.quantity <= i.min_quantity)::int as low
    from categories c left join items i on i.category_id = c.id and i.deleted_at is null
    where c.removed_at is null
    group by c.id order by c.position, c.id`;
  return rows.map(r => ({ ...shape(r), total: r.total, inStock: r.kind === "consumable" ? r.units : r.in_stock, inUse: r.in_use, inRepair: r.in_repair, low: r.low }));
}

export async function category(sql: Query, categoryId: unknown): Promise<Category> {
  const rows = await sql<Row[]>`select id, key, name, icon, kind, members_see from categories where id = ${id(categoryId)} and removed_at is null`;
  if (!rows[0]) throw new AppError("not_found");
  return shape(rows[0]);
}

export async function addCategory(sql: Sql, actor: Member | null, input: { name?: unknown; icon?: unknown; licence?: unknown; kind?: unknown }): Promise<Category> {
  manager(actor);
  const name = clean(input.name, limits.categoryName);
  const icon = isIcon(input.icon) ? input.icon : "box";
  if (input.kind !== undefined && !isKind(input.kind)) throw new AppError("invalid");
  const kind: Kind = isKind(input.kind) ? input.kind : input.licence === true ? "licence" : "asset";
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('equipment.categories'))`;
    const [counted] = await tx<{ n: number }[]>`select count(*)::int as n from categories where removed_at is null`;
    if (counted!.n >= limits.categories) throw new AppError("too_many", { max: limits.categories });
    const [row] = await tx<Row[]>`
      insert into categories (name, icon, kind, position)
      values (${name}, ${icon}, ${kind}, (select coalesce(max(position), 0) + 1 from categories))
      returning id, key, name, icon, kind, members_see`;
    return shape(row!);
  });
}

// A built-in category renamed to nothing takes its catalogue name again.
export async function updateCategory(sql: Sql, actor: Member | null, categoryId: unknown, input: { name?: unknown; icon?: unknown }): Promise<Category> {
  manager(actor);
  const current = await category(sql, categoryId);
  const name = current.key ? optional(input.name, limits.categoryName) : clean(input.name, limits.categoryName);
  if (input.icon !== undefined && !isIcon(input.icon)) throw new AppError("invalid");
  const icon = (input.icon as IconName | undefined) ?? current.icon;
  const [row] = await sql<Row[]>`update categories set name = ${name}, icon = ${icon} where id = ${current.id} returning id, key, name, icon, kind, members_see`;
  return shape(row!);
}

// Whether members see who holds this category's items (settings). Their
// own items stay theirs to see either way.
export async function setMembersSee(sql: Sql, actor: Member | null, categoryId: unknown, value: unknown): Promise<Category> {
  manager(actor);
  if (typeof value !== "boolean") throw new AppError("invalid");
  const current = await category(sql, categoryId);
  const [row] = await sql<Row[]>`update categories set members_see = ${value} where id = ${current.id} returning id, key, name, icon, kind, members_see`;
  return shape(row!);
}

// Only an empty category goes (its past items keep it, unlisted).
export async function removeCategory(sql: Sql, actor: Member | null, categoryId: unknown): Promise<void> {
  manager(actor);
  const current = await category(sql, categoryId);
  await sql.begin(async tx => {
    const used = await tx`select 1 from items where category_id = ${current.id} and deleted_at is null limit 1`;
    if (used.length > 0) throw new AppError("category_in_use");
    await tx`update categories set removed_at = now() where id = ${current.id}`;
  });
}

// Undo of a removal.
export async function restoreCategory(sql: Sql, actor: Member | null, categoryId: unknown): Promise<Category> {
  manager(actor);
  const [row] = await sql<Row[]>`update categories set removed_at = null where id = ${id(categoryId)} and removed_at is not null
    and (key is null or not exists (select 1 from categories c where c.key = categories.key and c.removed_at is null))
    returning id, key, name, icon, kind, members_see`;
  if (!row) throw new AppError("not_found");
  return shape(row);
}
