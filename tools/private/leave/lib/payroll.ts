import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { clip, cost, monthEnd, monthPattern, type Half } from "./calendar.ts";
import type { Query } from "./db.ts";
import { numeric } from "./model.ts";
import { rulesFor, settings, types } from "./rules.ts";

// The payroll export: every approved absence of a month, per person — its
// dates, its kind, the days it costs in that month (a leave across two
// months is split, counted with today's rules) and in all. HR only.
export type PayrollRow = { memberId: string; typeId: string; start: string; startHalf: Half; end: string; endHalf: Half; daysInMonth: number; days: number };

export async function payroll(sql: Query, actor: Member | null, month: unknown): Promise<PayrollRow[]> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  if (typeof month !== "string" || !monthPattern.test(month)) throw new AppError("invalid");
  const from = month + "-01";
  const to = monthEnd(from);
  const [s, all] = await Promise.all([settings(sql), types(sql, { archived: true })]);
  const rows = await sql<{ member_id: string; type_id: string; start_date: string; start_half: Half; end_date: string; end_half: Half; days: string }[]>`
    select member_id, type_id, to_char(start_date, 'YYYY-MM-DD') as start_date, start_half, to_char(end_date, 'YYYY-MM-DD') as end_date, end_half, days
    from requests where status = 'approved' and start_date <= ${to} and end_date >= ${from}
    order by member_id, start_date, id`;
  return rows.map(r => {
    const span = { start: r.start_date, startHalf: r.start_half, end: r.end_date, endHalf: r.end_half };
    const inside = r.start_date >= from && r.end_date <= to;
    const type = all.find(t => t.id === String(r.type_id));
    const part = inside || !type ? null : clip(span, from, to);
    return {
      memberId: r.member_id, typeId: String(r.type_id), ...span, days: numeric(r.days),
      daysInMonth: inside || !type ? numeric(r.days) : part ? cost(part, rulesFor(type, s, part.start, part.end), { tail: part.end === span.end }) : 0,
    };
  });
}
