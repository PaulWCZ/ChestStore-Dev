import type { Query } from "./db.ts";
import { managerIds } from "./directory.ts";
import { format, percent } from "./i18n/index.ts";
import { numeric } from "./model.ts";
import { notify } from "./notify.ts";
import { revenueOf } from "./rates.ts";

// Budget alerts: when a project's time (or its billable amount) crosses 80
// or 100 % of its budget, the managers find one item in their bell — once
// per threshold; a project that falls back under (time deleted, budget
// raised) may warn again later. Checked after each change of time and of a
// budget: nothing runs in the background. A courtesy: a failure here never
// undoes the change that caused it.
export const levels = [80, 100] as const;

export async function checkBudgets(sql: Query, projectIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return;
  try {
    const rows = await sql<{ id: string; name: string; budget_kind: "hours" | "money"; budget_minutes: number | null; budget_cents: string | null; minutes: string; cents: string }[]>`
      select p.id::text, p.name, p.budget_kind, p.budget_minutes, p.budget_cents::text,
        (select coalesce(sum(e.minutes), 0) from entries e where e.project_id = p.id and e.deleted_at is null)::text as minutes,
        (select ${revenueOf(sql)} from entries e where e.project_id = p.id and e.deleted_at is null) as cents
      from projects p where p.id = any(${ids}::bigint[])`;
    for (const p of rows) {
      const share = p.budget_kind === "hours" && p.budget_minutes ? numeric(p.minutes) / p.budget_minutes
        : p.budget_kind === "money" && p.budget_cents ? numeric(p.cents) / numeric(p.budget_cents)
        : null;
      const crossed = share === null ? [] : levels.filter(l => share * 100 >= l);
      await sql`delete from budget_alerts where project_id = ${p.id} and level <> all(${crossed}::int[])`;
      if (share === null || crossed.length === 0) continue;
      const fresh = await sql<{ level: number }[]>`
        insert into budget_alerts (project_id, level) select ${p.id}, l from unnest(${crossed}::int[]) as l
        on conflict do nothing returning level`;
      if (fresh.length === 0) continue;
      const over = share >= 1;
      await notify(await managerIds(), (t, locale) => ({
        title: format(over ? t.bell.budgetOver : t.bell.budgetNear, { project: p.name, percent: percent(share, locale) }),
      }), { path: `/chest/projects/${p.id}`, key: `budget:${p.id}` });
    }
  } catch (error) {
    console.error("budget check failed", error instanceof Error ? error.name : "non-error thrown");
  }
}
