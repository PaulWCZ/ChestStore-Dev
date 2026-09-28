import { ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import * as chest from "@argentic/chest-sdk/chest";
import { can, mayCreate, mayEdit } from "./access.ts";
import { AppError } from "./app-error.ts";
import { openCycle, readCycle } from "./cycles.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, isLevel, limits, measure, memberId, optionalId, score as readScore, type Level, type Measure } from "./model.ts";
import { objectiveById, type Clock, type Objective } from "./read.ts";
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
  const found = await objectiveById(sql, id(objectiveId), clock);
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
async function checkParent(sql: Query, cycleId: string, level: Level, parent: unknown): Promise<string | null> {
  const parentId = optionalId(parent);
  if (parentId === null) return null;
  if (level === "company") throw new AppError("parent_invalid");
  const [row] = await sql<{ cycle_id: string; level: Level }[]>`select cycle_id, level from objectives where id = ${parentId} and archived_at is null`;
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

export type KeyResultInput = { title?: unknown; kind?: unknown; unit?: unknown; start?: unknown; target?: unknown; owner?: unknown; weight?: unknown };
export type CheckedKeyResult = Measure & { title: string; owner: string; weight: number; currency: string | null };

export async function checkKeyResult(input: KeyResultInput, fallbackOwner: string): Promise<CheckedKeyResult> {
  const title = clean(input.title, limits.title);
  const m = measure(input);
  const owner = input.owner === undefined || input.owner === "" || input.owner === null ? fallbackOwner : await activeMember(input.owner);
  const weight = input.weight === undefined ? 1 : Number(input.weight);
  if (![1, 2, 3].includes(weight)) throw new AppError("invalid");
  return { ...m, title, owner, weight, currency: m.kind === "money" ? chest.currency() : null };
}

export async function insertKeyResult(sql: Query, actor: Member, objectiveId: string, k: CheckedKeyResult): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into key_results (objective_id, title, kind, unit, currency, start_value, target_value, current_value, weight, owner, position, created_by)
    values (${objectiveId}, ${k.title}, ${k.kind}, ${k.unit}, ${k.currency}, ${k.start}, ${k.target}, ${k.start}, ${k.weight}, ${k.owner},
      (select coalesce(max(position), 0) + 1 from key_results where objective_id = ${objectiveId}), ${actor.id})
    returning id`;
  return String(row!.id);
}

export type NewObjective = { cycleId?: unknown; level?: unknown; teamId?: unknown; parentId?: unknown; owner?: unknown; title?: unknown; why?: unknown; keyResults?: unknown };

export async function createObjective(sql: Sql, actor: Member | null, input: NewObjective): Promise<{ id: string; owner: string; keyResults: { id: string; owner: string; title: string }[] }> {
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
  const parentId = await checkParent(sql, cycle.id, level, input.parentId);
  const list = input.keyResults === undefined ? [] : input.keyResults;
  if (!Array.isArray(list)) throw new AppError("invalid");
  if (list.length > limits.keyResultsPerObjective) throw new AppError("too_many", { max: limits.keyResultsPerObjective });
  const krs: CheckedKeyResult[] = [];
  for (const k of list) krs.push(await checkKeyResult((k ?? {}) as KeyResultInput, owner));
  return sql.begin(async tx => {
    const [{ n }] = (await tx<{ n: string }[]>`select count(*) as n from objectives where cycle_id = ${cycle.id} and archived_at is null`) as unknown as [{ n: string }];
    if (Number(n) >= limits.objectivesPerCycle) throw new AppError("too_many", { max: limits.objectivesPerCycle });
    const [row] = await tx<{ id: string }[]>`
      insert into objectives (cycle_id, level, team_id, parent_id, owner, title, why, position, created_by)
      values (${cycle.id}, ${level}, ${theTeam?.id ?? null}, ${parentId}, ${owner}, ${title}, ${why},
        (select coalesce(max(position), 0) + 1 from objectives where cycle_id = ${cycle.id} and level = ${level}), ${actor.id})
      returning id`;
    const objectiveId = String(row!.id);
    const made: { id: string; owner: string; title: string }[] = [];
    for (const k of krs) made.push({ id: await insertKeyResult(tx, actor, objectiveId, k), owner: k.owner, title: k.title });
    return { id: objectiveId, owner, keyResults: made };
  });
}

export async function updateObjective(sql: Sql, actor: Member | null, objectiveId: unknown, input: { title?: unknown; why?: unknown; owner?: unknown; parentId?: unknown; teamId?: unknown }): Promise<{ previousOwner: string; owner: string; title: string }> {
  const o = await editable(sql, actor, objectiveId);
  const title = input.title === undefined ? undefined : clean(input.title, limits.title);
  const why = input.why === undefined ? undefined : clean(input.why, limits.why, { multiline: true, optional: true });
  let owner = o.owner;
  if (input.owner !== undefined && input.owner !== o.owner) {
    owner = await activeMember(input.owner);
    // A personal objective changes hands only through an admin.
    if (o.level === "personal" && !can(actor, "any.write")) throw new AppError("forbidden");
  }
  const parent = input.parentId === undefined ? undefined : await checkParent(sql, o.cycleId, o.level, input.parentId);
  let teamId: string | undefined;
  if (input.teamId !== undefined && o.level === "team" && String(input.teamId) !== o.teamId) {
    const next = await teamFor(sql, "team", input.teamId);
    if (next?.archived) throw new AppError("team_archived");
    const { personal } = await settings(sql);
    if (!mayCreate(actor, "team", next, personal)) throw new AppError("forbidden");
    teamId = next!.id;
  }
  if (parent !== undefined && parent === o.id) throw new AppError("parent_invalid");
  await sql`
    update objectives set
      title = coalesce(${title ?? null}, title),
      why = coalesce(${why ?? null}, why),
      owner = ${owner},
      parent_id = ${parent === undefined ? sql`parent_id` : parent},
      team_id = coalesce(${teamId ?? null}::bigint, team_id)
    where id = ${o.id}`;
  return { previousOwner: o.owner, owner, title: title ?? o.title };
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
      insert into objectives (cycle_id, level, team_id, owner, title, why, position, carried_from, created_by)
      select ${target.id}, level, team_id, owner, title, why, (select coalesce(max(position), 0) + 1 from objectives where cycle_id = ${target.id} and level = o.level), id, ${actor!.id}
      from objectives o where id = ${o.id}
      returning id`;
    const next = String(row!.id);
    await tx`
      insert into key_results (objective_id, title, kind, unit, currency, start_value, target_value, current_value, weight, owner, position, created_by)
      select ${next}, title, kind, unit, currency,
        case when kind = 'milestone' then 0 else current_value end, target_value,
        case when kind = 'milestone' then 0 else current_value end, weight, owner, position, ${actor!.id}
      from key_results
      where objective_id = ${o.id} and archived_at is null
        and not (case when target_value > start_value then current_value >= target_value else current_value <= target_value end)`;
    return next;
  });
}
