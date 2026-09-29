import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { clean, cycleDates, id, limits } from "./model.ts";
import { generatedName, periodName } from "./cycle-names.ts";
import { cycleById, type Cycle } from "./read.ts";

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
  const cycle = await cycleById(sql, id(cycleId), actor?.locale ?? null);
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
}

// A cycle made by mistake goes away while nothing is written in it.
export async function deleteCycle(sql: Sql, actor: Member | null, cycleId: unknown): Promise<void> {
  manage(actor);
  const cycle = await readCycle(sql, actor, cycleId);
  const [{ n }] = (await sql<{ n: string }[]>`select count(*) as n from objectives where cycle_id = ${cycle.id}`) as unknown as [{ n: string }];
  if (Number(n) > 0) throw new AppError("cycle_has_objectives");
  await sql`delete from cycles where id = ${cycle.id}`;
}
