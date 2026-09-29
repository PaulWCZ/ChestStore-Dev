import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import * as chest from "@argentic/chest-sdk/chest";
import { can, mayCreate, mayEdit, readerOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import { isLocale } from "./i18n/index.ts";
import { isSource, mayBeMine, refreshFed, refPattern, sourceKind, type Source } from "./sources.ts";
import { openCycle, readCycle } from "./cycles.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isLevel, isVisibility, limits, measure, memberId, optionalId, score as readScore, type Level, type Measure, type Visibility } from "./model.ts";
import { objectiveById, visibleTo, type Clock, type Objective } from "./read.ts";
import { settings, team } from "./teams.ts";

// Objectives: what the company, a team or a person commits to this cycle,
// why it matters, and the key results that say it is reached. Services
// check the rights first (lib/access.ts), bound what is written
// (lib/model.ts), and answer ids and codes.

const clockNow = (): Clock => ({ now: new Date(), weekStart: new Date(0) });

// An owner is a member who has the tool now.
export async function activeMember(value: unknown): Promise<string> {
  const who = memberId(value);
  try {
    if (!(await members.get(who))) throw new AppError("invalid");
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
  return who;
}

// The objective an actor may read (every member with a role reads all).
export async function readObjective(sql: Query, actor: Member | null, objectiveId: unknown, clock: Clock = clockNow()): Promise<Objective> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const found = await objectiveById(sql, id(objectiveId), clock, readerOf(actor!));
  if (!found) throw new AppError("not_found");
  return found;
}

// The objective an actor may change, in a cycle still open.
async function editable(sql: Query, actor: Member | null, objectiveId: unknown, options: { closedToo?: boolean } = {}): Promise<{ id: string; cycleId: string; level: Level; teamId: string | null; owner: string; title: string }> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<{ id: string; cycle_id: string; level: Level; team_id: string | null; owner: string; title: string }[]>`
    select id, cycle_id, level, team_id, owner, title from objectives where id = ${id(objectiveId)} and archived_at is null`;
  if (!row) throw new AppError("not_found");
  if (!mayEdit(actor, row)) throw new AppError("forbidden");
  if (!options.closedToo) await openCycle(sql, String(row.cycle_id));
  return { id: String(row.id), cycleId: String(row.cycle_id), level: row.level, teamId: row.team_id === null ? null : String(row.team_id), owner: row.owner, title: row.title };
}

// What an objective may be aligned to: a team's to a company objective, a
// person's to a company or team objective, of the same cycle.
async function checkParent(sql: Query, actor: Member, cycleId: string, level: Level, parent: unknown): Promise<string | null> {
  const parentId = optionalId(parent);
  if (parentId === null) return null;
  if (level === "company") throw new AppError("parent_invalid");
  const [row] = await sql<{ cycle_id: string; level: Level }[]>`select o.cycle_id, o.level from objectives o where o.id = ${parentId} and o.archived_at is null ${visibleTo(sql, readerOf(actor))}`;
  if (!row || String(row.cycle_id) !== cycleId) throw new AppError("parent_invalid");
  const allowed: Level[] = level === "team" ? ["company"] : ["company", "team"];
  if (!allowed.includes(row.level)) throw new AppError("parent_invalid");
  return parentId;
}

async function teamFor(sql: Query, level: Level, teamId: unknown) {
  if (level !== "team") return null;
  const found = await team(sql, id(teamId));
  if (!found) throw new AppError("not_found");
  return found;
}

export type KeyResultInput = { title?: unknown; kind?: unknown; unit?: unknown; start?: unknown; target?: unknown; owner?: unknown; weight?: unknown; source?: unknown; mine?: unknown; scope?: unknown };
export type CheckedKeyResult = Measure & { title: string; owner: string; weight: number; currency: string | null; source: Source | null; mine: boolean; scope: string | null };

// A fed key result's options (lib/sources.ts): "only theirs" where the
// source names people; a board of Tasks, or every board.
export function checkFeed(source: Source | null, mine: unknown, scope: unknown): { mine: boolean; scope: string | null } {
  if (mine !== undefined && mine !== null && typeof mine !== "boolean") throw new AppError("invalid");
  if (scope !== undefined && scope !== null && scope !== "" && (typeof scope !== "string" || !refPattern.test(scope))) throw new AppError("invalid");
  return {
    mine: source !== null && mayBeMine(source) && mine === true,
    scope: source === "tasks.done" && typeof scope === "string" && scope !== "" ? scope : null,
  };
}

// The language a unit is written in: its writer's (lib/values.ts, unitFor).
export const unitLocaleOf = (actor: Pick<Member, "locale">): string | null => (isLocale(actor.locale) ? actor.locale : null);

export function checkSource(value: unknown): Source | null {
  if (value === undefined || value === null || value === "" || value === "manual") return null;
  if (!isSource(value)) throw new AppError("invalid");
  return value;
}

export async function checkKeyResult(input: KeyResultInput, fallbackOwner: string): Promise<CheckedKeyResult> {
  const title = clean(input.title, limits.title);
  const source = checkSource(input.source);
  // Fed by another tool: an amount of money (the CRM's), or a count.
  const m = measure(source ? { ...input, kind: sourceKind(source) } : input);
  const owner = input.owner === undefined || input.owner === "" || input.owner === null ? fallbackOwner : await activeMember(input.owner);
  const weight = input.weight === undefined ? 1 : Number(input.weight);
  if (![1, 2, 3].includes(weight)) throw new AppError("invalid");
  return { ...m, title, owner, weight, currency: m.kind === "money" ? chest.currency() : null, source, ...checkFeed(source, input.mine, input.scope) };
}

export async function insertKeyResult(sql: Query, actor: Member, objectiveId: string, k: CheckedKeyResult): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into key_results (objective_id, title, kind, unit, unit_locale, currency, start_value, target_value, current_value, weight, owner, source, source_mine, source_scope, position, created_by)
    values (${objectiveId}, ${k.title}, ${k.kind}, ${k.unit}, ${k.unit ? unitLocaleOf(actor) : null}, ${k.currency}, ${k.start}, ${k.target}, ${k.start}, ${k.weight}, ${k.owner}, ${k.source}, ${k.mine}, ${k.scope},
      (select coalesce(max(position), 0) + 1 from key_results where objective_id = ${objectiveId}), ${actor.id})
    returning id`;
  if (k.source) await refreshFed(sql, [String(row!.id)]);
  return String(row!.id);
}

export type NewObjective = { cycleId?: unknown; level?: unknown; teamId?: unknown; parentId?: unknown; owner?: unknown; title?: unknown; why?: unknown; keyResults?: unknown; visibility?: unknown; viewers?: unknown };

// Who sees it: everyone (the default); its team, when the team is a group
// of the Chest (a team named here has no list of members); or the people
// chosen, members who have the tool. The owner, the owners of its key
// results and the admins always see it.
async function checkVisibility(visibility: unknown, viewers: unknown, level: Level, theTeam: { groupId: string | null } | null, owner: string): Promise<{ visibility: Visibility; viewers: string[] }> {
  if (visibility === undefined || visibility === null || visibility === "" || visibility === "everyone") return { visibility: "everyone", viewers: [] };
  if (!isVisibility(visibility)) throw new AppError("invalid");
  if (visibility === "team") {
    if (level !== "team" || !theTeam?.groupId) throw new AppError("invalid");
    return { visibility, viewers: [] };
  }
  const list = viewers === undefined ? [] : viewers;
  if (!Array.isArray(list)) throw new AppError("invalid");
  if (list.length > limits.viewers) throw new AppError("too_many", { max: limits.viewers });
  const ids: string[] = [];
  for (const v of new Set(list)) if (v !== owner) ids.push(await activeMember(v));
  return { visibility, viewers: ids };
}

export async function createObjective(sql: Sql, actor: Member | null, input: NewObjective): Promise<{ id: string; owner: string; keyResults: { id: string; owner: string; title: string }[]; viewers: string[] }> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const cycle = await openCycle(sql, (await readCycle(sql, actor, input.cycleId)).id);
  if (!isLevel(input.level)) throw new AppError("invalid");
  const level = input.level;
  const theTeam = await teamFor(sql, level, input.teamId);
  const { personal } = await settings(sql);
  if (level === "personal" && !personal) throw new AppError("personal_off");
  if (theTeam?.archived) throw new AppError("team_archived");
  if (!mayCreate(actor, level, theTeam, personal)) throw new AppError("forbidden");
  const title = clean(input.title, limits.title);
  const why = clean(input.why ?? "", limits.why, { multiline: true, optional: true });
  const owner = input.owner === undefined || input.owner === "" || input.owner === null ? actor.id : await activeMember(input.owner);
  // A personal objective is its owner's own; an admin may write one for
  // someone (to hand over what a person who left owned).
  if (level === "personal" && owner !== actor.id && !can(actor, "any.write")) throw new AppError("forbidden");
  const parentId = await checkParent(sql, actor, cycle.id, level, input.parentId);
  const seen = await checkVisibility(input.visibility, input.viewers, level, theTeam, owner);
  const list = input.keyResults === undefined ? [] : input.keyResults;
  if (!Array.isArray(list)) throw new AppError("invalid");
  if (list.length > limits.keyResultsPerObjective) throw new AppError("too_many", { max: limits.keyResultsPerObjective });
  const krs: CheckedKeyResult[] = [];
  for (const k of list) krs.push(await checkKeyResult((k ?? {}) as KeyResultInput, owner));
  return sql.begin(async tx => {
    const [{ n }] = (await tx<{ n: string }[]>`select count(*) as n from objectives where cycle_id = ${cycle.id} and archived_at is null`) as unknown as [{ n: string }];
    if (Number(n) >= limits.objectivesPerCycle) throw new AppError("too_many", { max: limits.objectivesPerCycle });
    const [row] = await tx<{ id: string }[]>`
      insert into objectives (cycle_id, level, team_id, parent_id, owner, title, why, visibility, position, created_by)
      values (${cycle.id}, ${level}, ${theTeam?.id ?? null}, ${parentId}, ${owner}, ${title}, ${why}, ${seen.visibility},
        (select coalesce(max(position), 0) + 1 from objectives where cycle_id = ${cycle.id} and level = ${level}), ${actor.id})
      returning id`;
    const objectiveId = String(row!.id);
    for (const v of seen.viewers) await tx`insert into objective_viewers (objective_id, member_id) values (${objectiveId}, ${v})`;
    const made: { id: string; owner: string; title: string }[] = [];
    for (const k of krs) made.push({ id: await insertKeyResult(tx, actor, objectiveId, k), owner: k.owner, title: k.title });
    return { id: objectiveId, owner, keyResults: made, viewers: seen.viewers };
  });
}

export async function updateObjective(sql: Sql, actor: Member | null, objectiveId: unknown, input: { title?: unknown; why?: unknown; owner?: unknown; parentId?: unknown; teamId?: unknown; visibility?: unknown; viewers?: unknown }): Promise<{ previousOwner: string; owner: string; title: string; newViewers: string[] }> {
  const o = await editable(sql, actor, objectiveId);
  const title = input.title === undefined ? undefined : clean(input.title, limits.title);
  const why = input.why === undefined ? undefined : clean(input.why, limits.why, { multiline: true, optional: true });
  let owner = o.owner;
  if (input.owner !== undefined && input.owner !== o.owner) {
    owner = await activeMember(input.owner);
    // A personal objective changes hands only through an admin.
    if (o.level === "personal" && !can(actor, "any.write")) throw new AppError("forbidden");
  }
  const parent = input.parentId === undefined ? undefined : await checkParent(sql, actor!, o.cycleId, o.level, input.parentId);
  let teamId: string | undefined;
  if (input.teamId !== undefined && o.level === "team" && String(input.teamId) !== o.teamId) {
    const next = await teamFor(sql, "team", input.teamId);
    if (next?.archived) throw new AppError("team_archived");
    const { personal } = await settings(sql);
    if (!mayCreate(actor, "team", next, personal)) throw new AppError("forbidden");
    teamId = next!.id;
  }
  if (parent !== undefined && parent === o.id) throw new AppError("parent_invalid");
  const seen = input.visibility === undefined ? null : await checkVisibility(input.visibility, input.viewers, o.level, o.level === "team" ? await team(sql, teamId ?? o.teamId!) : null, owner);
  const before = seen ? new Set((await sql<{ member_id: string }[]>`select member_id from objective_viewers where objective_id = ${o.id}`).map(r => r.member_id)) : new Set<string>();
  await sql.begin(async tx => {
    await tx`
      update objectives set
        title = coalesce(${title ?? null}, title),
        why = coalesce(${why ?? null}, why),
        owner = ${owner},
        parent_id = ${parent === undefined ? tx`parent_id` : parent},
        team_id = coalesce(${teamId ?? null}::bigint, team_id)
      where id = ${o.id}`;
    if (seen) {
      await tx`update objectives set visibility = ${seen.visibility} where id = ${o.id}`;
      await tx`delete from objective_viewers where objective_id = ${o.id}`;
      for (const v of seen.viewers) await tx`insert into objective_viewers (objective_id, member_id) values (${o.id}, ${v})`;
    }
  });
  return { previousOwner: o.owner, owner, title: title ?? o.title, newViewers: seen ? seen.viewers.filter(v => !before.has(v)) : [] };
}

// Archived with Undo: the objective and its key results leave every view;
// objectives aligned to it are no longer aligned to anything shown.
export async function archiveObjective(sql: Sql, actor: Member | null, objectiveId: unknown): Promise<void> {
  const o = await editable(sql, actor, objectiveId);
  await sql`update objectives set archived_at = now() where id = ${o.id}`;
}

export async function restoreObjective(sql: Sql, actor: Member | null, objectiveId: unknown): Promise<void> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const [row] = await sql<{ id: string; owner: string; cycle_id: string }[]>`select id, owner, cycle_id from objectives where id = ${id(objectiveId)} and archived_at is not null`;
  if (!row) throw new AppError("not_found");
  if (!mayEdit(actor, row)) throw new AppError("forbidden");
  await openCycle(sql, String(row.cycle_id));
  await sql`update objectives set archived_at = null where id = ${row.id}`;
}

// The retrospective, once the cycle ended or closed: a score and what we
// learned, by the owner or an admin.
export async function saveRetro(sql: Sql, actor: Member | null, objectiveId: unknown, input: { score?: unknown; learned?: unknown }, today: string): Promise<void> {
  const o = await editable(sql, actor, objectiveId, { closedToo: true });
  const cycle = await readCycle(sql, actor, o.cycleId);
  if (!cycle.closed && today <= cycle.endsOn && !can(actor, "cycles.manage")) throw new AppError("forbidden");
  const s = readScore(input.score);
  const learned = clean(input.learned ?? "", limits.learned, { multiline: true, optional: true });
  await sql`update objectives set score = ${s}, learned = ${learned}, retro_by = ${actor!.id}, retro_at = now() where id = ${o.id}`;
}

// Carried over to another open cycle: the objective again, with its key
// results not reached, each starting where it stopped.
export async function carryOver(sql: Sql, actor: Member | null, objectiveId: unknown, cycleId: unknown): Promise<string> {
  const o = await editable(sql, actor, objectiveId, { closedToo: true });
  const target = await openCycle(sql, (await readCycle(sql, actor, cycleId)).id);
  if (target.id === o.cycleId) throw new AppError("invalid");
  if (o.level === "team") {
    const t = await team(sql, o.teamId!);
    if (t?.archived) throw new AppError("team_archived");
  }
  const [already] = await sql<{ id: string }[]>`select id from objectives where carried_from = ${o.id} and cycle_id = ${target.id} and archived_at is null`;
  if (already) return String(already.id);
  return sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`
      insert into objectives (cycle_id, level, team_id, owner, title, why, visibility, position, carried_from, created_by)
      select ${target.id}, level, team_id, owner, title, why, visibility, (select coalesce(max(position), 0) + 1 from objectives where cycle_id = ${target.id} and level = o.level), id, ${actor!.id}
      from objectives o where id = ${o.id}
      returning id`;
    const next = String(row!.id);
    await tx`insert into objective_viewers (objective_id, member_id) select ${next}, member_id from objective_viewers where objective_id = ${o.id}`;
    await tx`
      insert into key_results (objective_id, title, kind, unit, unit_locale, currency, start_value, target_value, current_value, weight, owner, source, source_mine, source_scope, position, created_by)
      select ${next}, title, kind, unit, unit_locale, currency,
        case when kind = 'milestone' or source is not null then 0 else current_value end, target_value,
        case when kind = 'milestone' or source is not null then 0 else current_value end, weight, owner, source, source_mine, source_scope, position, ${actor!.id}
      from key_results
      where objective_id = ${o.id} and archived_at is null
        and not (case when target_value > start_value then current_value >= target_value else current_value <= target_value end)`;
    await refreshFed(tx, (await tx<{ id: string }[]>`select id from key_results where objective_id = ${next} and source is not null`).map(r => String(r.id)));
    return next;
  });
}
