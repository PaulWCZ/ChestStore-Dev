import { localeOf, type Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, cycleDates, id, limits, objectiveProgress, percent, progress } from "./model.ts";
import { generatedName, periodName } from "./cycle-names.ts";
import { refreshFed } from "./sources.ts";
import { cycleById, visibleTo, type Cycle, type Reader } from "./read.ts";

// Cycles: a period (a quarter, usually) the company sets its objectives
// for. Admins create them, pick the current one, close one when it ends
// (the retrospectives stay readable) and may reopen it.

function manage(actor: Member | null): Member {
  if (!actor || !can(actor, "cycles.manage")) throw new AppError("forbidden");
  return actor;
}

// readCycle: a cycle as the actor reads it (a generated name in their
// language).
export async function readCycle(sql: Query, actor: Member | null, cycleId: unknown): Promise<Cycle> {
  if (!can(actor, "read")) throw new AppError("forbidden");
  const cycle = await cycleById(sql, id(cycleId), actor ? localeOf(actor.language) : null);
  if (!cycle) throw new AppError("not_found");
  return cycle;
}

// A cycle open for writing: objectives, key results, check-ins.
export async function openCycle(sql: Query, cycleId: string): Promise<Cycle> {
  const cycle = await cycleById(sql, cycleId);
  if (!cycle) throw new AppError("not_found");
  if (cycle.closed) throw new AppError("closed");
  return cycle;
}

export async function createCycle(sql: Sql, actor: Member | null, input: { name?: unknown; startsOn?: unknown; endsOn?: unknown; current?: unknown }): Promise<Cycle> {
  const who = manage(actor);
  const name = clean(input.name, limits.cycleName);
  const { startsOn, endsOn } = cycleDates(input.startsOn, input.endsOn);
  // The suggestion kept as it was ("Q1 2027", in any language): the tool's
  // own name, shown in each reader's language.
  const generated = generatedName(name, startsOn, endsOn);
  const created = await sql.begin(async tx => {
    const [{ n }] = (await tx<{ n: string }[]>`select count(*) as n from cycles where current`) as unknown as [{ n: string }];
    // The first cycle is current by itself; a later one when asked.
    const current = input.current === true || Number(n) === 0;
    if (current) await tx`update cycles set current = false where current`;
    const [row] = await tx<{ id: string }[]>`insert into cycles (name, generated, starts_on, ends_on, current, created_by) values (${name}, ${generated}, ${startsOn}, ${endsOn}, ${current}, ${who.id}) returning id`;
    return String(row!.id);
  });
  return (await cycleById(sql, created))!;
}

export async function updateCycle(sql: Sql, actor: Member | null, cycleId: unknown, input: { name?: unknown; startsOn?: unknown; endsOn?: unknown }): Promise<Cycle> {
  manage(actor);
  const cycle = (await cycleById(sql, (await readCycle(sql, actor, cycleId)).id))!;
  const { startsOn, endsOn } = cycleDates(input.startsOn ?? cycle.startsOn, input.endsOn ?? cycle.endsOn);
  // Not renamed (the tool's name kept, in whatever language it showed):
  // it stays the tool's, for the new dates. Renamed: the admin's words.
  const typed = input.name === undefined ? null : clean(input.name, limits.cycleName);
  const kept = cycle.generated && (typed === null || generatedName(typed, cycle.startsOn, cycle.endsOn));
  const name = kept ? periodName(startsOn, endsOn, "en") : typed ?? cycle.name;
  const generated = kept || generatedName(name, startsOn, endsOn);
  await sql`update cycles set name = ${name}, generated = ${generated}, starts_on = ${startsOn}, ends_on = ${endsOn} where id = ${cycle.id}`;
  // Values fed by other tools count what happened in the cycle's dates.
  await refreshCycle(sql, cycle.id);
  return (await cycleById(sql, cycle.id))!;
}

export async function setCurrent(sql: Sql, actor: Member | null, cycleId: unknown): Promise<void> {
  manage(actor);
  const cycle = await readCycle(sql, actor, cycleId);
  if (cycle.closed) throw new AppError("closed");
  await sql.begin(async tx => {
    await tx`update cycles set current = false where current and id <> ${cycle.id}`;
    await tx`update cycles set current = true where id = ${cycle.id}`;
  });
}

// Closing freezes a cycle's objectives, key results and check-ins; the
// retrospectives may still be written. It stops being current.
export async function closeCycle(sql: Sql, actor: Member | null, cycleId: unknown): Promise<void> {
  const who = manage(actor);
  const cycle = await readCycle(sql, actor, cycleId);
  if (cycle.closed) return;
  await sql`update cycles set closed_at = now(), closed_by = ${who.id}, current = false where id = ${cycle.id}`;
}

export async function reopenCycle(sql: Sql, actor: Member | null, cycleId: unknown): Promise<void> {
  manage(actor);
  const cycle = await readCycle(sql, actor, cycleId);
  await sql`update cycles set closed_at = null, closed_by = null where id = ${cycle.id}`;
  // Closed, its fed values were left as they were: counted again now.
  await refreshCycle(sql, cycle.id);
}

// Every fed key result of a cycle, counted again (src/lib/sources.ts).
async function refreshCycle(sql: Query, cycleId: string): Promise<void> {
  const ids = (await sql<{ id: string }[]>`select k.id::text from key_results k join objectives o on o.id = k.objective_id where o.cycle_id = ${cycleId} and k.source is not null`).map(r => r.id);
  if (ids.length > 0) await refreshFed(sql, ids);
}

// A cycle made by mistake goes away while nothing is written in it.
export async function deleteCycle(sql: Sql, actor: Member | null, cycleId: unknown): Promise<void> {
  manage(actor);
  const cycle = await readCycle(sql, actor, cycleId);
  const [{ n }] = (await sql<{ n: string }[]>`select count(*) as n from objectives where cycle_id = ${cycle.id}`) as unknown as [{ n: string }];
  if (Number(n) > 0) throw new AppError("cycle_has_objectives");
  await sql`delete from cycles where id = ${cycle.id}`;
}

// What the Cycles page says of each cycle, for this reader (the
// confidential objectives they do not see are not counted): how many
// objectives, how many have their retrospective, and the company's
// progress — the mean of its company objectives' progress, each the
// weighted mean of its key results, rounded once, as the Company page
// writes it (lib/read.ts, model.ts).
export type CycleStats = { objectives: number; retros: number; progress: number | null };
export async function cycleStats(sql: Query, reader: Reader): Promise<Map<string, CycleStats>> {
  const counts = await sql<{ cycle_id: string; n: number; retro: number }[]>`
    select o.cycle_id, count(*)::int as n, (count(*) filter (where o.score is not null or o.learned <> ''))::int as retro
    from objectives o where o.archived_at is null ${visibleTo(sql, reader)} group by o.cycle_id`;
  const rows = await sql<{ cycle_id: string; objective_id: string; start_value: string; target_value: string; current_value: string; weight: number }[]>`
    select o.cycle_id, o.id as objective_id, k.start_value, k.target_value, k.current_value, k.weight
    from key_results k join objectives o on o.id = k.objective_id
    where k.archived_at is null and o.archived_at is null and o.level = 'company' ${visibleTo(sql, reader)}`;
  // Each company objective's key results, by cycle.
  const byCycle = new Map<string, Map<string, { progress: number; weight: number }[]>>();
  for (const r of rows) {
    const cycle = String(r.cycle_id), objective = String(r.objective_id);
    let objectives = byCycle.get(cycle);
    if (!objectives) byCycle.set(cycle, (objectives = new Map()));
    let list = objectives.get(objective);
    if (!list) objectives.set(objective, (list = []));
    list.push({ progress: progress(Number(r.start_value), Number(r.target_value), Number(r.current_value)), weight: Number(r.weight) });
  }
  const found = new Map<string, CycleStats>();
  for (const r of counts) found.set(String(r.cycle_id), { objectives: r.n, retros: r.retro, progress: null });
  for (const [cycle, objectives] of byCycle) {
    const each = [...objectives.values()].map(list => objectiveProgress(list)).filter((p): p is number => p !== null);
    const entry = found.get(cycle) ?? { objectives: 0, retros: 0, progress: null };
    found.set(cycle, { ...entry, progress: percent(objectiveProgress(each.map(p => ({ progress: p, weight: 1 })))) });
  }
  return found;
}
