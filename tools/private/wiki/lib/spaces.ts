import type { Member } from "@argentic/chest-sdk/member";
import { can, spaceAccess, type SpaceAccess } from "./access.ts";
import type { Fragment, Query, Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { clean, colors, groupIds, id, isColor, limits, type Color } from "./model.ts";
import { between } from "./position.ts";

// Spaces: the shelves of the wiki ("Handbook", "Sales", "Tech"), each with
// its tree of pages. Every function takes the database and the member
// acting, checks their access (lib/access.ts) and throws AppError with a
// code. A space the actor cannot see does not exist for them (not_found).

export type Space = {
  id: string;
  name: string;
  description: string;
  color: Color;
  position: string;
  visibility: "everyone" | "groups";
  groups: string[];
  createdBy: string;
  access: SpaceAccess;
  pages: number;
};

type SpaceRow = { id: string; name: string; description: string; color: string; position: string; visibility: "everyone" | "groups"; created_by: string; pages: number };

async function rows(sql: Query, where: Fragment): Promise<Space[]> {
  const found = await sql<SpaceRow[]>`
    select s.id, s.name, s.description, s.color, s.position, s.visibility, s.created_by,
      (select count(*)::int from pages p where p.space_id = s.id and p.deleted_at is null) as pages
    from spaces s where ${where} order by s.position, s.id`;
  const ids = found.map(r => String(r.id));
  const groups = new Map<string, string[]>(ids.map(i => [i, []]));
  if (ids.length > 0) for (const g of await sql<{ space_id: string; group_id: string }[]>`select space_id, group_id from space_groups where space_id in ${sql(ids)} order by group_id`) groups.get(String(g.space_id))?.push(g.group_id);
  return found.map(r => ({
    id: String(r.id),
    name: r.name,
    description: r.description,
    color: isColor(r.color) ? r.color : "green",
    position: r.position,
    visibility: r.visibility,
    groups: groups.get(String(r.id)) ?? [],
    createdBy: r.created_by,
    access: "none" as SpaceAccess,
    pages: r.pages,
  }));
}

const withAccess = (actor: Member | null) => (s: Space): Space => ({ ...s, access: spaceAccess(actor, s) });

// The spaces the actor sees, in their order.
export async function listSpaces(sql: Query, actor: Member | null): Promise<Space[]> {
  if (!actor) throw new AppError("forbidden");
  return (await rows(sql, sql`true`)).map(withAccess(actor)).filter(s => s.access !== "none");
}

// space reads one space as the actor may see it.
export async function space(sql: Query, actor: Member | null, spaceId: unknown, needed: "read" | "write" = "read"): Promise<Space> {
  const key = id(spaceId);
  const [found] = (await rows(sql, sql`s.id = ${key}`)).map(withAccess(actor));
  if (!found || found.access === "none") throw new AppError("not_found");
  if (needed === "write" && found.access !== "write") throw new AppError("forbidden");
  return found;
}

export type SpaceInput = { name?: unknown; description?: unknown; color?: unknown; visibility?: unknown; groups?: unknown };

export async function createSpace(sql: Sql, actor: Member | null, input: SpaceInput): Promise<Space> {
  if (!actor || !can(actor, "write")) throw new AppError("forbidden");
  const name = clean(input.name, limits.spaceName);
  const description = input.description === undefined ? "" : clean(input.description, limits.spaceDescription, { optional: true });
  const [count] = await sql<{ n: number; last: string | null }[]>`select count(*)::int as n, max(position) as last from spaces`;
  if ((count?.n ?? 0) >= limits.spaces) throw new AppError("too_many", { max: limits.spaces });
  const color: Color = isColor(input.color) ? input.color : colors[(count?.n ?? 0) % colors.length]!;
  const visibility = input.visibility === "groups" ? "groups" : "everyone";
  const groups = input.groups === undefined ? [] : groupIds(input.groups);
  const spaceId = await sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into spaces (name, description, color, position, visibility, created_by)
      values (${name}, ${description}, ${color}, ${between(count?.last ?? null, null)}, ${visibility}, ${actor.id}) returning id`;
    for (const g of groups) await tx`insert into space_groups (space_id, group_id) values (${row!.id}, ${g})`;
    return String(row!.id);
  });
  return space(sql, actor, spaceId);
}

export async function updateSpace(sql: Sql, actor: Member | null, spaceId: unknown, input: SpaceInput): Promise<Space> {
  const s = await space(sql, actor, spaceId, "write");
  const name = input.name === undefined ? s.name : clean(input.name, limits.spaceName);
  const description = input.description === undefined ? s.description : clean(input.description, limits.spaceDescription, { optional: true });
  const color = input.color === undefined ? s.color : isColor(input.color) ? input.color : s.color;
  const visibility = input.visibility === undefined ? s.visibility : input.visibility === "groups" ? "groups" : "everyone";
  const groups = input.groups === undefined ? s.groups : groupIds(input.groups);
  // Kept to groups, a space needs at least one: otherwise it would be the
  // creator's alone, which is what a draft is for.
  if (visibility === "groups" && groups.length === 0) throw new AppError("invalid");
  await sql.begin(async tx => {
    await tx`update spaces set name = ${name}, description = ${description}, color = ${color}, visibility = ${visibility} where id = ${s.id}`;
    await tx`delete from space_groups where space_id = ${s.id}`;
    for (const g of groups) await tx`insert into space_groups (space_id, group_id) values (${s.id}, ${g})`;
  });
  return space(sql, actor, s.id);
}

// moveSpace puts a space before another one (or last, with null).
export async function moveSpace(sql: Sql, actor: Member | null, spaceId: unknown, beforeId: unknown): Promise<void> {
  const s = await space(sql, actor, spaceId, "write");
  const all = (await rows(sql, sql`true`)).filter(x => x.id !== s.id);
  const at = beforeId === null ? all.length : all.findIndex(x => x.id === String(beforeId));
  if (at < 0) throw new AppError("invalid");
  const position = between(all[at - 1]?.position ?? null, all[at]?.position ?? null);
  await sql`update spaces set position = ${position} where id = ${s.id}`;
}

// deleteSpace removes an empty space (its trash goes with it). The Chest
// objects of its files are answered, for the caller to remove.
export async function deleteSpace(sql: Sql, actor: Member | null, spaceId: unknown): Promise<{ objects: string[] }> {
  const s = await space(sql, actor, spaceId, "write");
  return sql.begin(async tx => {
    const [live] = await tx<{ n: number }[]>`select count(*)::int as n from pages where space_id = ${s.id} and deleted_at is null`;
    if ((live?.n ?? 0) > 0) throw new AppError("not_empty");
    const objects = await tx<{ object: string }[]>`select f.object from page_files f join pages p on p.id = f.page_id where p.space_id = ${s.id}`;
    await tx`delete from spaces where id = ${s.id}`;
    return { objects: objects.map(o => o.object) };
  });
}

// The ids of the spaces the actor sees (for searches and lists).
export async function visibleSpaceIds(sql: Query, actor: Member | null): Promise<string[]> {
  return (await listSpaces(sql, actor)).map(s => s.id);
}
