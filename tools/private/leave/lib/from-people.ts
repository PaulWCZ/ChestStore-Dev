import type { Query, Sql } from "./db.ts";
import { isDay, type Day } from "./calendar.ts";
import { settleAfterLastDay, type Settled } from "./last-day.ts";
import { today } from "./model.ts";
import { withdraw } from "./notify.ts";
import { afterLastDay, refreshBadges } from "./tell.ts";

// What People tells Leave (Proposal (studio): events between tools;
// chest.proposals.json "receives"), once an admin linked the two: HR
// writes a person's employee number, first day, last day and working week
// once, in People's HR record, and Leave takes them — HR never types them
// twice. Every event is checked field by field; one of another shape
// changes nothing. Events come at least once and not always in order: an
// event older than the last one applied changes nothing.
//
//   people.record            { member, employeeNumber, startDate, lastDay, workDays, weeklyHours }
//   people.leaving           { member, lastDay }   (a leaving checklist started in People)
//   people.leaving_cancelled { member }
//
// What People does not say (null) is left as HR set it here. A last day
// People told is People's: it takes it back (the record's last day
// cleared, the leaving checklist stopped); one HR typed here, or the
// Chest's own when the person left, is never undone by People. A last day
// from the record (the legal one) wins over a leaving checklist's.
// Weekly hours are not used: Leave counts days (the week's days are).
export type RecordEvent = { member: string; employeeNumber: string | null; startDate: Day | null; lastDay: Day | null; workDays: number[] | null };

const memberPattern = /^mbr_[a-z2-7]{26}$/u;
const dayOrNull = (v: unknown): v is Day | null => v === null || isDay(v);

export function readRecord(data: unknown): RecordEvent | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["member"] !== "string" || !memberPattern.test(d["member"])) return null;
  const number = d["employeeNumber"] ?? null;
  if (number !== null && (typeof number !== "string" || number.trim() === "" || [...number].length > 30 || /\p{Cc}/u.test(number))) return null;
  const startDate = d["startDate"] ?? null;
  const lastDay = d["lastDay"] ?? null;
  if (!dayOrNull(startDate) || !dayOrNull(lastDay)) return null;
  if (startDate && lastDay && lastDay < startDate) return null;
  const days = d["workDays"] ?? null;
  if (days !== null && (!Array.isArray(days) || days.length === 0 || days.length > 7 || !days.every(n => Number.isInteger(n) && n >= 1 && n <= 7) || new Set(days).size !== days.length)) return null;
  const hours = d["weeklyHours"] ?? null;
  if (hours !== null && (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || hours > 60)) return null;
  // People's days are ISO (1 Monday … 7 Sunday); Leave's are 0 Sunday … 6.
  const workDays = days === null ? null : (days as number[]).map(n => n % 7).sort((a, b) => a - b);
  return { member: d["member"], employeeNumber: number === null ? null : number.trim(), startDate, lastDay, workDays };
}

export function readLeaving(data: unknown): { member: string; lastDay: Day | null } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["member"] !== "string" || !memberPattern.test(d["member"])) return null;
  if (d["lastDay"] === undefined) return { member: d["member"], lastDay: null };
  return isDay(d["lastDay"]) ? { member: d["member"], lastDay: d["lastDay"] } : null;
}

type Staffed = { end_date: string | null; end_by: string | null; record_at: Date | null; leaving_at: Date | null };

// The last day changes (set, moved, or cleared): the leave after it is
// settled in the same transaction; what was settled is said to HR after.
async function setLastDay(tx: Query, who: string, end: Day | null, by: "record" | "leaving" | null): Promise<Settled & { end: Day | null }> {
  await tx`update staff set end_date = ${end}, end_by = ${end ? by : null}, updated_at = now() where member_id = ${who}`;
  return { ...(end ? await settleAfterLastDay(tx, who, end, "chest") : { cancelled: [], cut: [], days: 0 }), end };
}

async function after(sql: Sql, who: string, settled: Settled & { end?: Day | null }): Promise<void> {
  for (const id of settled.cancelled) await withdraw(`req:${id}`);
  if (settled.cancelled.length + settled.cut.length > 0) await afterLastDay(who, settled, settled.end && settled.end >= today() ? settled.end : undefined);
  await refreshBadges(sql);
}

// people.record: the number, first day, week and last day HR wrote in
// People. What changed is applied; a number already someone else's here is
// left (HR sees both people and fixes it).
export async function fromRecord(sql: Sql, data: unknown, at: Date): Promise<boolean> {
  const e = readRecord(data);
  if (!e) return false;
  const settled = await sql.begin(async tx => {
    await tx`insert into staff (member_id) values (${e.member}) on conflict do nothing`;
    const [row] = await tx<Staffed[]>`select to_char(end_date, 'YYYY-MM-DD') as end_date, end_by, record_at, leaving_at from staff where member_id = ${e.member} for update`;
    if (row!.record_at && row!.record_at > at) return null;
    await tx`update staff set record_at = ${at} where member_id = ${e.member}`;
    if (e.startDate) await tx`update staff set start_date = ${e.startDate}, updated_at = now() where member_id = ${e.member}`;
    if (e.workDays) {
      const week = e.workDays.join() === "1,2,3,4,5" ? null : e.workDays;
      await tx`update staff set work_days = ${week === null ? null : tx.array(week)}::smallint[], updated_at = now() where member_id = ${e.member}`;
    }
    if (e.employeeNumber) {
      const [taken] = await tx`select 1 from staff where employee_number = ${e.employeeNumber} and member_id <> ${e.member}`;
      if (!taken) await tx`update staff set employee_number = ${e.employeeNumber}, updated_at = now() where member_id = ${e.member}`;
    }
    if (e.lastDay && e.lastDay !== row!.end_date) return setLastDay(tx, e.member, e.lastDay, "record");
    if (e.lastDay && row!.end_by !== "record") await tx`update staff set end_by = 'record' where member_id = ${e.member}`;
    if (!e.lastDay && row!.end_by === "record") return setLastDay(tx, e.member, null, null);
    return { cancelled: [], cut: [], days: 0 };
  });
  if (settled) await after(sql, e.member, settled);
  return true;
}

// people.leaving / people.leaving_cancelled: a departure HR started in
// People (a leaving checklist). It sets the last day unless HR typed one
// here, the record gave one, or the person already left the Chest.
export async function fromLeaving(sql: Sql, data: unknown, at: Date, cancelled: boolean): Promise<boolean> {
  const e = readLeaving(data);
  if (!e || (!cancelled && !e.lastDay)) return false;
  const settled = await sql.begin(async tx => {
    await tx`insert into staff (member_id) values (${e.member}) on conflict do nothing`;
    const [row] = await tx<Staffed[]>`select to_char(end_date, 'YYYY-MM-DD') as end_date, end_by, record_at, leaving_at from staff where member_id = ${e.member} for update`;
    if (row!.leaving_at && row!.leaving_at > at) return null;
    await tx`update staff set leaving_at = ${at} where member_id = ${e.member}`;
    if (cancelled) return row!.end_by === "leaving" ? setLastDay(tx, e.member, null, null) : null;
    if (row!.end_date && row!.end_by !== "leaving") return null;
    if (row!.end_date === e.lastDay) return null;
    return setLastDay(tx, e.member, e.lastDay, "leaving");
  });
  if (settled) await after(sql, e.member, settled);
  return true;
}
