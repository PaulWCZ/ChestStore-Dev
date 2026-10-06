import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { id } from "../shared/model.ts";
import { scope, where, type ReportQuery } from "./reports.ts";
import { transaction } from "./tx.ts";

// Invoiced time. The invoice itself is made elsewhere (the Quotes tool, or
// the company's accounting); here a manager marks the billable time of a
// report as invoiced once it is: that time then no longer changes (nobody
// edits it, its rates are written on it for good) and leaves the
// "Billable, not invoiced" view. "Undo" puts it back as it was.
export const maxInvoiced = 20000;
export type Marked = { ids: string[]; fixed: string[] };

export async function markInvoiced(sql: Query, actor: Member | null, q: ReportQuery): Promise<Marked> {
  if (!actor || !can(actor, "invoice")) throw new AppError("forbidden");
  // The very scope of the report the manager reads.
  const s = { ...scope(actor, q), billable: "uninvoiced" as const };
  return transaction(sql, async tx => {
    const found = await tx<{ id: string; fixed: boolean }[]>`
      select e.id::text, e.rates_fixed as fixed from entries e join projects p on p.id = e.project_id
      where ${where(tx, s)} order by e.id limit ${maxInvoiced + 1} for update of e`;
    if (found.length > maxInvoiced) throw new AppError("too_many", { max: maxInvoiced });
    if (found.length === 0) return { ids: [], fixed: [] };
    const ids = found.map(f => f.id);
    const fixed = found.filter(f => !f.fixed).map(f => f.id);
    await tx`
      update entries e set invoiced_at = now(), invoiced_by = ${actor.id}, rates_fixed = true,
        bill_rate_cents = case when e.rates_fixed then e.bill_rate_cents else bill_rate(e.member_id, e.project_id, e.day) end,
        cost_rate_cents = case when e.rates_fixed then e.cost_rate_cents else cost_rate(e.member_id, e.day) end
      where id = any(${ids}::bigint[])`;
    return { ids, fixed };
  });
}

// unmarkInvoiced: "Undo" of a marking, or a manager's correction.
export async function unmarkInvoiced(sql: Query, actor: Member | null, marked: unknown): Promise<number> {
  if (!actor || !can(actor, "invoice")) throw new AppError("forbidden");
  const m = marked as Partial<Marked> | null;
  if (!m || !Array.isArray(m.ids) || !Array.isArray(m.fixed) || m.ids.length > maxInvoiced || m.fixed.length > m.ids.length) throw new AppError("invalid");
  const ids = m.ids.map(id);
  const fixed = m.fixed.map(id).filter(x => ids.includes(x));
  return transaction(sql, async tx => {
    const done = await tx`update entries set invoiced_at = null, invoiced_by = null where id = any(${ids}::bigint[]) and invoiced_at is not null`;
    if (fixed.length) await tx`update entries set rates_fixed = false, bill_rate_cents = null, cost_rate_cents = null where id = any(${fixed}::bigint[]) and invoiced_at is null`;
    return done.count;
  });
}
