import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { clip, cost, monthEnd, monthPattern, type Half } from "../shared/calendar.ts";
import type { Query } from "./db.ts";
import { numeric } from "../shared/model.ts";
import { rulesFor, settings, types } from "./rules.ts";
import { staffOf } from "./staff.ts";

// The payroll export: every approved absence of a month, per person — its
// dates, its kind, the days it costs in that month (a leave across two
// months is split, counted with today's rules and the person's week) and in
// all, with the person's employee number. Kinds that are not absences
// (remote work) are left out. HR only.
export type PayrollRow = { memberId: string; employeeNumber: string | null; typeId: string; start: string; startHalf: Half; end: string; endHalf: Half; daysInMonth: number; days: number };

export async function payroll(sql: Query, actor: Member | null, month: unknown): Promise<PayrollRow[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  if (typeof month !== "string" || !monthPattern.test(month)) throw new AppError("invalid");
  const from = month + "-01";
  const to = monthEnd(from);
  const [s, all] = await Promise.all([settings(sql), types(sql, { archived: true })]);
  const rows = await sql<{ member_id: string; type_id: string; start_date: string; start_half: Half; end_date: string; end_half: Half; days: string }[]>`
    select r.member_id, r.type_id, to_char(r.start_date, 'YYYY-MM-DD') as start_date, r.start_half, to_char(r.end_date, 'YYYY-MM-DD') as end_date, r.end_half, r.days
    from requests r join leave_types t on t.id = r.type_id
    where r.status = 'approved' and t.away and r.start_date <= ${to} and r.end_date >= ${from}
    order by r.member_id, r.start_date, r.id`;
  const staff = await staffOf(sql, [...new Set(rows.map(r => r.member_id))]);
  return rows.map(r => {
    const span = { start: r.start_date, startHalf: r.start_half, end: r.end_date, endHalf: r.end_half };
    const inside = r.start_date >= from && r.end_date <= to;
    const type = all.find(t => t.id === String(r.type_id));
    const part = inside || !type ? null : clip(span, from, to);
    return {
      memberId: r.member_id, employeeNumber: staff.get(r.member_id)?.employeeNumber ?? null, typeId: String(r.type_id), ...span, days: numeric(r.days),
      daysInMonth: inside || !type ? numeric(r.days) : part ? cost(part, rulesFor(type, s, part.start, part.end, staff.get(r.member_id)?.workDays), { tail: part.end === span.end, head: part.start === span.start }) : 0,
    };
  });
}
