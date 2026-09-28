import type { Member } from "@argentic/chest-sdk/member";
import { can, canBeApprover } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Day } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { roleNow } from "./directory.ts";
import { memberId, optionalDay } from "./model.ts";

// Each person as HR set them: who answers their requests (null: HR), and
// since when they earn leave (null: not set — then only an opening balance
// starts their count).
export type Staff = { memberId: string; approverId: string | null; startDate: Day | null };

type Row = { member_id: string; approver_id: string | null; start_date: string | null };
const toStaff = (r: Row): Staff => ({ memberId: r.member_id, approverId: r.approver_id, startDate: r.start_date });

export async function staffOf(sql: Query, ids: string[]): Promise<Map<string, Staff>> {
  const found = new Map<string, Staff>(ids.map(i => [i, { memberId: i, approverId: null, startDate: null }]));
  if (ids.length === 0) return found;
  const rows = await sql<Row[]>`select member_id, approver_id, to_char(start_date, 'YYYY-MM-DD') as start_date from staff where member_id in ${sql(ids)}`;
  for (const r of rows) found.set(r.member_id, toStaff(r));
  return found;
}

export async function staffRow(sql: Query, id: string): Promise<Staff> {
  return (await staffOf(sql, [id])).get(id)!;
}

// Everyone HR has set something for (the people page adds the others).
export async function allStaff(sql: Query): Promise<Map<string, Staff>> {
  const rows = await sql<Row[]>`select member_id, approver_id, to_char(start_date, 'YYYY-MM-DD') as start_date from staff`;
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
