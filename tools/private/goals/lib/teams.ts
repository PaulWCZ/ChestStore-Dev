import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, groupPattern, id, limits } from "./model.ts";

// Teams: the Chest's groups when the company has made them — their names
// and members come from the Chest, so nobody keeps a second list — or a
// name of the tool's own (a small company often gives the tool to everyone
// and has no groups). Admins add, rename and archive them.

export type Team = { id: string; name: string; groupId: string | null; archived: boolean; members: string[] | null };
export type Group = { id: string; name: string; members: string[] };

// The Chest's groups that give the tool; [] when the Chest cannot say.
export async function chestGroups(): Promise<Group[]> {
  try {
    return (await members.groups.list()).map(g => ({ id: g.id, name: g.name, members: [...g.members] }));
  } catch (error) {
    if (error instanceof ChestError) return [];
    throw error;
  }
}

export async function teams(sql: Query, options: { archived?: boolean; groups?: Group[] } = {}): Promise<Team[]> {
  const rows = await sql<{ id: string; name: string; group_id: string | null; archived_at: Date | null }[]>`
    select id, name, group_id, archived_at from teams ${options.archived ? sql`` : sql`where archived_at is null`} order by lower(name), id limit 200`;
  const groups = options.groups ?? (rows.some(r => r.group_id) ? await chestGroups() : []);
  const byId = new Map(groups.map(g => [g.id, g]));
  return rows
    .map(r => {
      const group = r.group_id ? byId.get(r.group_id) : undefined;
      return { id: String(r.id), name: group?.name ?? r.name, groupId: r.group_id, archived: r.archived_at !== null, members: r.group_id ? group?.members ?? [] : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function team(sql: Query, teamId: string): Promise<Team | null> {
  const [row] = await sql<{ id: string; name: string; group_id: string | null; archived_at: Date | null }[]>`select id, name, group_id, archived_at from teams where id = ${teamId}`;
  if (!row) return null;
  const group = row.group_id ? (await chestGroups()).find(g => g.id === row.group_id) : undefined;
  return { id: String(row.id), name: group?.name ?? row.name, groupId: row.group_id, archived: row.archived_at !== null, members: row.group_id ? group?.members ?? [] : null };
}

function manage(actor: Member | null): Member {
  if (!actor || !can(actor, "settings.manage")) throw new AppError("forbidden");
  return actor;
}

async function count(sql: Query): Promise<number> {
  const [{ n }] = (await sql<{ n: string }[]>`select count(*) as n from teams where archived_at is null`) as unknown as [{ n: string }];
  return Number(n);
}

// A team named in the tool.
export async function addTeam(sql: Sql, actor: Member | null, name: unknown): Promise<Team> {
  manage(actor);
  const text = clean(name, limits.teamName);
  if ((await count(sql)) >= limits.teams) throw new AppError("too_many", { max: limits.teams });
  const [same] = await sql`select 1 from teams where lower(name) = lower(${text}) and archived_at is null and group_id is null`;
  if (same) throw new AppError("team_exists");
  const [row] = await sql<{ id: string }[]>`insert into teams (name) values (${text}) returning id`;
  return (await team(sql, String(row!.id)))!;
}

// A team that is a group of the Chest (its name kept as a fallback only).
export async function addGroupTeam(sql: Sql, actor: Member | null, groupId: unknown): Promise<Team> {
  manage(actor);
  if (typeof groupId !== "string" || !groupPattern.test(groupId)) throw new AppError("invalid");
  const group = (await chestGroups()).find(g => g.id === groupId);
  if (!group) throw new AppError("not_found");
  const [existing] = await sql<{ id: string }[]>`select id from teams where group_id = ${groupId}`;
  if (existing) {
    await sql`update teams set archived_at = null where id = ${existing.id}`;
    return (await team(sql, String(existing.id)))!;
  }
  if ((await count(sql)) >= limits.teams) throw new AppError("too_many", { max: limits.teams });
  const [row] = await sql<{ id: string }[]>`insert into teams (name, group_id) values (${group.name.slice(0, limits.teamName) || "·"}, ${groupId}) returning id`;
  return (await team(sql, String(row!.id)))!;
}

// Every group of the Chest not yet a team, in one click.
export async function addAllGroups(sql: Sql, actor: Member | null): Promise<number> {
  manage(actor);
  let added = 0;
  const taken = new Set((await sql<{ group_id: string }[]>`select group_id from teams where group_id is not null and archived_at is null`).map(r => r.group_id));
  for (const g of await chestGroups()) {
    if (taken.has(g.id)) continue;
    await addGroupTeam(sql, actor, g.id);
    added++;
  }
  return added;
}

export async function renameTeam(sql: Sql, actor: Member | null, teamId: unknown, name: unknown): Promise<void> {
  manage(actor);
  const text = clean(name, limits.teamName);
  const [row] = await sql<{ group_id: string | null }[]>`select group_id from teams where id = ${id(teamId)}`;
  if (!row) throw new AppError("not_found");
  // A group's name is the Chest's: it is changed there.
  if (row.group_id) throw new AppError("forbidden");
  await sql`update teams set name = ${text} where id = ${id(teamId)}`;
}

// Archived, a team takes no new objectives; its objectives stay.
export async function archiveTeam(sql: Sql, actor: Member | null, teamId: unknown, archived: boolean): Promise<void> {
  manage(actor);
  const rows = await sql`update teams set archived_at = case when ${archived}::boolean then now() else null end where id = ${id(teamId)} returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}

// The settings: personal objectives, off unless an admin turns them on.
export type Settings = { personal: boolean };

export async function settings(sql: Query): Promise<Settings> {
  const [row] = await sql<{ personal: boolean }[]>`select personal from settings where id`;
  return { personal: row?.personal ?? false };
}

export async function saveSettings(sql: Sql, actor: Member | null, input: { personal?: unknown }): Promise<Settings> {
  const who = manage(actor);
  if (typeof input.personal !== "boolean") throw new AppError("invalid");
  await sql`update settings set personal = ${input.personal}, updated_by = ${who.id}, updated_at = now() where id`;
  return settings(sql);
}
