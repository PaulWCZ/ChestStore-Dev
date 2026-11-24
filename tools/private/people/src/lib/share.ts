import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import type { Query } from "./db.ts";

// What People tells the other tools of the Chest (events between tools, SDK
// 0.5+; chest.json "emits", each type with its fields), once the owner
// approved the link:
// someone is leaving, and on which last day — Equipment lists what they
// hold to take back before it. Who and when, nothing else: no reason, no
// checklist, no note. A courtesy: when the Chest cannot take it, the
// checklist in People still stands.
//
// A departure is what HR sets in People: a leaving checklist ("offboarding")
// started for a member, whose day is their last day. It is told again when
// it changes, and taken back when no leaving checklist runs any more
// (stopped; restarted, it is told again).
//
//   people.leaving           { member, lastDay }   — lastDay "YYYY-MM-DD"
//   people.leaving-cancelled { member }
//
// Keys carry the time of the change (leaving, cancelled, leaving again are
// three events; one change told twice is one); the subject is the person
// (their words come in order). The audience is who sees it in People: a
// departure, those who see the person's leaving checklists (HR, the
// person, their manager, whoever has an item in it — seesJourney); a
// record, those who see the record (HR and the person — recordAccess). A
// receiver shows it to them only.
type Type = "people.leaving" | "people.leaving-cancelled" | "people.record";
async function emit(type: Type, data: Record<string, unknown>, key: string, audience: events.EmitAudience): Promise<boolean> {
  try {
    await events.emit(type, data, { subject: String(data["member"]), key, audience });
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

const people = (ids: Iterable<string | null>): string[] => [...new Set([...ids].filter((id): id is string => typeof id === "string" && /^mbr_[a-z2-7]{26}$/u.test(id)))].sort();

// Who sees this person's leaving checklists (seesJourney), running or
// stopped: HR, the person, their manager, and those given an item.
export async function departureAudience(sql: Query, memberId: string): Promise<events.EmitAudience> {
  const rows = await sql<{ manager_id: string | null; assignees: string[] | null }[]>`
    select p.manager_id, (select array_agg(distinct i.assignee) from journey_items i where i.journey_id = j.id and i.assignee is not null) as assignees
    from journeys j left join profiles p on p.member_id = j.person_id
    where j.person_id = ${memberId} and j.kind = 'offboarding'`;
  return { roles: ["hr"], members: people([memberId, ...rows.flatMap(r => [r.manager_id, ...(r.assignees ?? [])])]) };
}

// Who sees a person's record (recordAccess): HR and the person.
export const recordAudience = (memberId: string): events.EmitAudience => ({ roles: ["hr"], members: [memberId] });

// The person's last day as People knows it now: the latest last day of the
// leaving checklists running for them (null: not leaving).
export async function lastDay(sql: Query, memberId: string): Promise<string | null> {
  const [row] = await sql<{ last_day: string | null }[]>`
    select to_char(max(anchor), 'YYYY-MM-DD') as last_day from journeys
    where person_id = ${memberId} and kind = 'offboarding' and stopped_at is null`;
  return row?.last_day ?? null;
}

// around runs a change of this person's checklists (start, stop, restart)
// and tells what it changed of their departure: a new or moved last day,
// or none any more. A change that moves nothing (a welcome checklist, a
// second leaving checklist on an earlier day) tells nothing.
export async function around<T>(sql: Query, memberId: string | null, change: () => Promise<T>): Promise<T> {
  const person = memberId && /^mbr_[a-z2-7]{26}$/u.test(memberId) ? memberId : null;
  const before = person ? await lastDay(sql, person) : null;
  const done = await change();
  if (!person) return done;
  const after = await lastDay(sql, person);
  if (after === before) return done;
  const at = Date.now();
  const audience = await departureAudience(sql, person);
  if (after) await emit("people.leaving", { member: person, lastDay: after }, `people:${person}:leaving:${at}`, audience);
  else await emit("people.leaving-cancelled", { member: person }, `people:${person}:stays:${at}`, audience);
  return done;
}

// What Leave (and any HR tool) needs of a person's HR record, so HR never
// types it twice: their employee number, first day, last day, the days of
// the week they work and their weekly hours. Told when a record linked to
// a member is written, linked or imported, and only when one of these
// changed since People last told it (records.told); a record not told
// (the Chest could not take it) is told at its next change.
//
//   people.record { member, employeeNumber, startDate, lastDay, workDays, weeklyHours }
//     employeeNumber  string | null
//     startDate       "YYYY-MM-DD" | null
//     lastDay         "YYYY-MM-DD" | null   (the record's last day, written by HR)
//     workDays        "1,2,3,4,5" | null    (ISO days, 1 = Monday, as text: an
//                                           event's fields are flat; null: not said)
//     weeklyHours     number | null
//
// Never the name, the contract, the address or anything else of the record.
export type Told = { member: string; employeeNumber: string | null; startDate: string | null; lastDay: string | null; workDays: string | null; weeklyHours: number | null };

// An event's text refuses format characters (Unicode Cf: a zero-width
// space, a BOM, a joiner): stripped in the event only — the record keeps
// what HR typed.
export const eventText = (text: string): string => text.replace(/\p{Cf}/gu, "");

export async function tellRecords(sql: Query, recordIds: string[]): Promise<number> {
  if (recordIds.length === 0) return 0;
  const rows = await sql<{ id: string; member_id: string; employee_number: string; start_date: string | null; end_date: string | null; work_days: number[] | null; hours: string | null; told: string | null }[]>`
    select id, member_id, employee_number, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, work_days, hours::text as hours, told
    from records where id in ${sql(recordIds)} and member_id is not null and erased_at is null`;
  let told = 0;
  for (const r of rows) {
    const data: Told = {
      member: r.member_id, employeeNumber: eventText(r.employee_number) || null, startDate: r.start_date, lastDay: r.end_date,
      workDays: r.work_days === null || r.work_days.length === 0 ? null : r.work_days.map(Number).join(","), weeklyHours: r.hours === null ? null : Number(r.hours),
    };
    const text = JSON.stringify(data);
    if (text === r.told) continue;
    if (!(await emit("people.record", data, `people:${r.member_id}:record:${Date.now()}`, recordAudience(r.member_id)))) continue;
    await sql`update records set told = ${text} where id = ${r.id}`;
    told++;
  }
  return told;
}
