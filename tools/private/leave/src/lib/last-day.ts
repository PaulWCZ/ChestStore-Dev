import { cost, type Day, type Half, type Span } from "../shared/calendar.ts";
import type { Query } from "./db.ts";
import { numeric } from "../shared/model.ts";
import { leaveType, rulesFor, settings } from "./rules.ts";

// A last day set (by the Chest when someone leaves, or by HR): the leave
// recorded after it would still count against the final balance, which is
// what payroll pays (the indemnité compensatrice). So, in the same
// transaction:
// - leave that starts after the last day is cancelled — the history says
//   why ('after_last_day') and its days come back in the ledger;
// - leave that runs past the last day ends on it ('cut'), costs what is
//   left of it, and the difference comes back.
// Both kinds of lines carry the reason key 'afterLastDay'. Pending
// requests are treated the same way. Running it again changes nothing.
export type Settled = { cancelled: string[]; cut: string[]; days: number };

type Row = { id: string; type_id: string; start_date: string; start_half: Half; end_date: string; end_half: Half; days: string; status: "pending" | "approved" };

export async function settleAfterLastDay(tx: Query, who: string, end: Day, by: string): Promise<Settled> {
  const rows = await tx<Row[]>`
    select id, type_id, to_char(start_date, 'YYYY-MM-DD') as start_date, start_half, to_char(end_date, 'YYYY-MM-DD') as end_date, end_half, days, status
    from requests where member_id = ${who} and status in ('pending', 'approved') and end_date > ${end}
    order by start_date, id for update`;
  const done: Settled = { cancelled: [], cut: [], days: 0 };
  if (rows.length === 0) return done;
  const [s, week] = await Promise.all([settings(tx), tx<{ work_days: number[] | null }[]>`select work_days from staff where member_id = ${who}`]);
  const workDays = week[0]?.work_days ? week[0].work_days.map(Number) : null;
  for (const r of rows) {
    const id = String(r.id);
    const type = await leaveType(tx, r.type_id);
    let after = 0;
    if (r.start_date <= end) {
      const span: Span = { start: r.start_date, startHalf: r.start_half, end, endHalf: "pm" };
      // Nothing after the last day: the paid-leave rule that runs to the
      // day before the person is back does not apply (they are not back).
      after = cost(span, rulesFor(type, s, span.start, span.end, workDays), { tail: false });
    }
    if (after > 0) {
      await tx`update requests set end_date = ${end}, end_half = 'pm', days = ${after}, cancel_asked_at = null where id = ${id}`;
      await tx`insert into request_events (request_id, actor, kind) values (${id}, ${by}, 'cut')`;
      done.cut.push(id);
    } else {
      await tx`update requests set status = 'cancelled', cancel_asked_at = null where id = ${id}`;
      await tx`insert into request_events (request_id, actor, kind) values (${id}, ${by}, 'after_last_day')`;
      done.cancelled.push(id);
    }
    if (r.status !== "approved" || !type.balance) continue;
    // What the ledger holds for this request, and what it should hold now.
    const [{ held } = { held: "0" }] = await tx<{ held: string }[]>`select coalesce(sum(days), 0) as held from ledger where request_id = ${id} and kind in ('taken', 'returned')`;
    const back = Math.round((-numeric(held) - after) * 100) / 100;
    if (back <= 0) continue;
    await tx`
      insert into ledger (member_id, type_id, kind, days, on_date, reason_key, request_id, created_by)
      values (${who}, ${type.id}, 'returned', ${back}, ${r.start_date}, 'afterLastDay', ${id}, ${by})`;
    done.days += back;
  }
  return done;
}
