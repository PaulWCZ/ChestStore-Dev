import type { Member } from "@argentic/chest-sdk/member";
import { can, canBeApprover } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Day } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { roleNow } from "./directory.ts";
import { isWeek } from "./calendar.ts";
import { clean, limits, memberId, optionalDay } from "./model.ts";

// Each person as HR set them: who answers their requests (null: HR), their
// start date (null: not set — then only an opening balance starts their
// count), their last day (null: still here; set when they leave the
// Chest), the days of the week they work (null: Monday to Friday) and
// their employee number for payroll.
export type Staff = { memberId: string; approverId: string | null; startDate: Day | null; endDate: Day | null; workDays: number[] | null; employeeNumber: string | null };

type Row = { member_id: string; approver_id: string | null; start_date: string | null; end_date: string | null; work_days: number[] | null; employee_number: string | null };
const toStaff = (r: Row): Staff => ({
  memberId: r.member_id, approverId: r.approver_id, startDate: r.start_date, endDate: r.end_date,
  workDays: r.work_days ? r.work_days.map(Number).sort((a, b) => a - b) : null, employeeNumber: r.employee_number,
});
const columns = (sql: Query) => sql`member_id, approver_id, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, work_days, employee_number`;
export const blankStaff = (memberId: string): Staff => ({ memberId, approverId: null, startDate: null, endDate: null, workDays: null, employeeNumber: null });

export async function staffOf(sql: Query, ids: string[]): Promise<Map<string, Staff>> {
  const found = new Map<string, Staff>(ids.map(i => [i, blankStaff(i)]));
  if (ids.length === 0) return found;
  const rows = await sql<Row[]>`select ${columns(sql)} from staff where member_id in ${sql(ids)}`;
  for (const r of rows) found.set(r.member_id, toStaff(r));
  return found;
}

export async function staffRow(sql: Query, id: string): Promise<Staff> {
  return (await staffOf(sql, [id])).get(id)!;
}

// Everyone HR has set something for (the people page adds the others).
export async function allStaff(sql: Query): Promise<Map<string, Staff>> {
  const rows = await sql<Row[]>`select ${columns(sql)} from staff`;
  return new Map(rows.map(r => [r.member_id, toStaff(r)]));
}

// The people someone approves.
export async function approvees(sql: Query, approverId: string): Promise<string[]> {
  return (await sql<{ member_id: string }[]>`select member_id from staff where approver_id = ${approverId}`).map(r => r.member_id);
}

// setApprover: HR names who answers a person's requests — someone whose
// role answers requests (HR or manager), never the person themselves — or
// nobody (HR answers).
export async function setApprover(sql: Sql, actor: Member | null, person: unknown, approver: unknown): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(person);
  const approverId = approver === null || approver === "" || approver === undefined ? null : memberId(approver);
  if (approverId !== null && (approverId === who || !canBeApprover(await roleNow(approverId)))) throw new AppError("approver_invalid");
  await sql`
    insert into staff (member_id, approver_id) values (${who}, ${approverId})
    on conflict (member_id) do update set approver_id = excluded.approver_id, updated_at = now()`;
}

// setStartDate: HR sets since when someone earns leave.
export async function setStartDate(sql: Sql, actor: Member | null, person: unknown, value: unknown): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(person);
  const start = optionalDay(value);
  await sql`
    insert into staff (member_id, start_date) values (${who}, ${start})
    on conflict (member_id) do update set start_date = excluded.start_date, updated_at = now()`;
}

// setEndDate: HR sets (or clears) a person's last day: nothing is earned
// after it; their balance on that day is what payroll pays when they leave.
export async function setEndDate(sql: Sql, actor: Member | null, person: unknown, value: unknown): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(person);
  const end = optionalDay(value);
  await sql`
    insert into staff (member_id, end_date) values (${who}, ${end})
    on conflict (member_id) do update set end_date = excluded.end_date, updated_at = now()`;
}

// setWorkDays: HR sets the days of the week someone works (null: Monday to
// Friday). Part-time staff earn as much leave; their days are counted from
// the first day they would have worked to the day before they are back.
export async function setWorkDays(sql: Sql, actor: Member | null, person: unknown, value: unknown): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(person);
  if (value !== null && !isWeek(value)) throw new AppError("invalid");
  const days = value === null || [...value].sort().join() === "1,2,3,4,5" ? null : [...value].sort((a, b) => a - b);
  await sql`
    insert into staff (member_id, work_days) values (${who}, ${days})
    on conflict (member_id) do update set work_days = excluded.work_days, updated_at = now()`;
}

// setEmployeeNumber: the number payroll knows the person by (Silae, PayFit,
// Sage import by it). Two people never share one.
export async function setEmployeeNumber(sql: Sql, actor: Member | null, person: unknown, value: unknown): Promise<void> {
  if (!can(actor, "people.all")) throw new AppError("forbidden");
  const who = memberId(person);
  const number = clean(value ?? "", limits.employeeNumber, { optional: true }) || null;
  const [taken] = number ? await sql`select 1 from staff where employee_number = ${number} and member_id <> ${who}` : [];
  if (taken) throw new AppError("number_taken");
  await sql`
    insert into staff (member_id, employee_number) values (${who}, ${number})
    on conflict (member_id) do update set employee_number = excluded.employee_number, updated_at = now()`;
}

// Everyone the tool holds records of — to find those who left: a last day
// set, or balance lines or requests of someone the Chest no longer lists.
export async function formerIds(sql: Query): Promise<string[]> {
  const rows = await sql<{ member_id: string }[]>`
    select member_id from staff where end_date is not null
    union select member_id from ledger where member_id <> 'erased'
    union select member_id from requests where member_id <> 'erased'`;
  return rows.map(r => r.member_id);
}
