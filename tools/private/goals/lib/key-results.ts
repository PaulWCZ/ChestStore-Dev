import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { can, mayCheckIn, mayEdit } from "./access.ts";
import { AppError } from "./app-error.ts";
import { openCycle } from "./cycles.ts";
import type { Query, Sql } from "./db.ts";
import { checkValue, clean, id, isConfidence, limits, measure, progress, undoMinutes, type Confidence, type Kind } from "./model.ts";
import { activeMember, checkKeyResult, insertKeyResult, type KeyResultInput } from "./objectives.ts";

// Key results and their weekly check-ins. A key result is added and
// changed by its objective's owner (or an admin); its owner (or an admin)
// checks in: a new value, a confidence, a line. Check-ins are never edited:
// the latest may be taken back by its author for half an hour.

type KeyResultRow = { id: string; objective_id: string; cycle_id: string; objective_owner: string; objective_title: string; owner: string; title: string; kind: Kind; start_value: string; target_value: string; current_value: string; archived: boolean };

async function load(sql: Query, keyResultId: unknown, options: { archived?: boolean } = {}): Promise<KeyResultRow> {
  const [row] = await sql<KeyResultRow[]>`
    select k.id, k.objective_id, o.cycle_id, o.owner as objective_owner, o.title as objective_title, k.owner, k.title, k.kind, k.start_value, k.target_value, k.current_value, (k.archived_at is not null) as archived
    from key_results k join objectives o on o.id = k.objective_id and o.archived_at is null
    where k.id = ${id(keyResultId)}`;
  if (!row || row.archived !== Boolean(options.archived)) throw new AppError("not_found");
  return row;
}

export async function addKeyResult(sql: Sql, actor: Member | null, objectiveId: unknown, input: KeyResultInput): Promise<{ id: string; owner: string; title: string; objectiveTitle: string }> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const [o] = await sql<{ id: string; cycle_id: string; owner: string; title: string }[]>`select id, cycle_id, owner, title from objectives where id = ${id(objectiveId)} and archived_at is null`;
  if (!o) throw new AppError("not_found");
  if (!mayEdit(actor, o)) throw new AppError("forbidden");
  await openCycle(sql, String(o.cycle_id));
  const k = await checkKeyResult(input, o.owner);
  const [{ n }] = (await sql<{ n: string }[]>`select count(*) as n from key_results where objective_id = ${o.id} and archived_at is null`) as unknown as [{ n: string }];
  if (Number(n) >= limits.keyResultsPerObjective) throw new AppError("too_many", { max: limits.keyResultsPerObjective });
  return { id: await insertKeyResult(sql, actor, String(o.id), k), owner: k.owner, title: k.title, objectiveTitle: o.title };
}

// Title, owner, weight, and the measure: its kind only while nobody checked
// in; its start and target at any time (the history keeps its values).
export async function updateKeyResult(sql: Sql, actor: Member | null, keyResultId: unknown, input: KeyResultInput): Promise<{ previousOwner: string; owner: string; title: string; objectiveId: string; objectiveTitle: string }> {
  const k = await load(sql, keyResultId);
  if (!mayEdit(actor, { owner: k.objective_owner })) throw new AppError("forbidden");
  await openCycle(sql, String(k.cycle_id));
  const title = input.title === undefined ? k.title : clean(input.title, limits.title);
  const owner = input.owner === undefined || input.owner === k.owner ? k.owner : await activeMember(input.owner);
  const weight = input.weight === undefined ? undefined : Number(input.weight);
  if (weight !== undefined && ![1, 2, 3].includes(weight)) throw new AppError("invalid");
  let m: { kind: Kind; unit: string; start: number; target: number } | undefined;
  if (input.kind !== undefined || input.start !== undefined || input.target !== undefined || input.unit !== undefined) {
    const kind = input.kind ?? k.kind;
    m = measure({ kind, unit: input.unit, start: input.start ?? k.start_value, target: input.target ?? k.target_value });
    if (m.kind !== k.kind) {
      const [some] = await sql`select 1 from check_ins where key_result_id = ${k.id} limit 1`;
      if (some) throw new AppError("invalid");
    }
  }
  await sql.begin(async tx => {
    await tx`update key_results set title = ${title}, owner = ${owner}, weight = coalesce(${weight ?? null}::smallint, weight) where id = ${k.id}`;
    if (m) {
      const [{ checked }] = (await tx<{ checked: boolean }[]>`select exists (select 1 from check_ins where key_result_id = ${k.id}) as checked`) as unknown as [{ checked: boolean }];
      // Without a check-in, the current value is the start.
      await tx`
        update key_results set kind = ${m.kind}, unit = ${m.unit}, start_value = ${m.start}, target_value = ${m.target},
          current_value = case when ${checked}::boolean then current_value else ${m.start} end,
          currency = case when ${m.kind} = 'money' then coalesce(currency, ${chest.currency()}) else null end
        where id = ${k.id}`;
    }
  });
  return { previousOwner: k.owner, owner, title, objectiveId: String(k.objective_id), objectiveTitle: k.objective_title };
}

export async function archiveKeyResult(sql: Sql, actor: Member | null, keyResultId: unknown, archived: boolean): Promise<{ owner: string }> {
  const k = await load(sql, keyResultId, { archived: !archived });
  if (!mayEdit(actor, { owner: k.objective_owner })) throw new AppError("forbidden");
  await openCycle(sql, String(k.cycle_id));
  if (!archived) {
    const [{ n }] = (await sql<{ n: string }[]>`select count(*) as n from key_results where objective_id = ${k.objective_id} and archived_at is null`) as unknown as [{ n: string }];
    if (Number(n) >= limits.keyResultsPerObjective) throw new AppError("too_many", { max: limits.keyResultsPerObjective });
  }
  await sql`update key_results set archived_at = case when ${archived}::boolean then now() else null end where id = ${k.id}`;
  return { owner: k.owner };
}

export type CheckInDone = { id: string; keyResultId: string; objectiveId: string; owner: string; value: number; confidence: Confidence; progress: number };

export async function checkIn(sql: Sql, actor: Member | null, keyResultId: unknown, input: { value?: unknown; confidence?: unknown; note?: unknown }): Promise<CheckInDone> {
  if (!actor) throw new AppError("forbidden");
  const k = await load(sql, keyResultId);
  if (!mayCheckIn(actor, k)) throw new AppError("forbidden");
  await openCycle(sql, String(k.cycle_id));
  const value = checkValue(k.kind, input.value);
  if (!isConfidence(input.confidence)) throw new AppError("invalid");
  const note = clean(input.note ?? "", limits.note, { multiline: true, optional: true });
  const made = await sql.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`insert into check_ins (key_result_id, value, confidence, note, author) values (${k.id}, ${value}, ${input.confidence as Confidence}, ${note}, ${actor.id}) returning id`;
    await tx`update key_results set current_value = ${value} where id = ${k.id}`;
    return String(row!.id);
  });
  return { id: made, keyResultId: String(k.id), objectiveId: String(k.objective_id), owner: k.owner, value, confidence: input.confidence as Confidence, progress: progress(Number(k.start_value), Number(k.target_value), value) };
}

// The latest check-in of a key result, taken back by its author (or an
// admin) within half an hour: the value goes back to the one before.
export async function undoCheckIn(sql: Sql, actor: Member | null, checkInId: unknown): Promise<{ keyResultId: string; owner: string }> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const [c] = await sql<{ id: string; key_result_id: string; author: string; recent: boolean }[]>`
    select id, key_result_id, author, created_at > now() - make_interval(mins => ${undoMinutes}) as recent from check_ins where id = ${id(checkInId)}`;
  if (!c) throw new AppError("not_found");
  if (c.author !== actor.id && !can(actor, "any.write")) throw new AppError("forbidden");
  const k = await load(sql, c.key_result_id);
  await openCycle(sql, String(k.cycle_id));
  if (!c.recent && !can(actor, "any.write")) throw new AppError("too_late");
  await sql.begin(async tx => {
    const [latest] = await tx<{ id: string }[]>`select id from check_ins where key_result_id = ${k.id} order by created_at desc, id desc limit 1`;
    if (String(latest?.id) !== String(c.id)) throw new AppError("too_late");
    await tx`delete from check_ins where id = ${c.id}`;
    await tx`
      update key_results set current_value = coalesce((select value from check_ins where key_result_id = ${k.id} order by created_at desc, id desc limit 1), start_value)
      where id = ${k.id}`;
  });
  return { keyResultId: String(k.id), owner: k.owner };
}
