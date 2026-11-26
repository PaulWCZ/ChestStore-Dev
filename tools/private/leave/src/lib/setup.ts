import type { Query } from "./db.ts";

// HR's first run: the three things that make the numbers right, ticked as
// they are done — the counting rule (settings saved once), everyone's
// balances and start dates (an import, or set by hand), who answers whose
// requests. Shown on HR's home until all three are done.
export type SetupStep = { key: "rules" | "balances" | "approvers"; href: string; done: boolean };

export async function setupSteps(sql: Query): Promise<{ list: SetupStep[]; done: boolean }> {
  const [row] = await sql<{ rules: boolean; balances: boolean; approvers: boolean }[]>`
    select
      (select updated_at is not null from settings) as rules,
      exists (select 1 from ledger where kind = 'opening') or exists (select 1 from staff where start_date is not null) as balances,
      exists (select 1 from staff where approver_id is not null) as approvers`;
  const list: SetupStep[] = [
    { key: "rules", href: "/chest/settings", done: row?.rules ?? false },
    { key: "balances", href: "/chest/people/import", done: row?.balances ?? false },
    { key: "approvers", href: "/chest/people", done: row?.approvers ?? false },
  ];
  return { list, done: list.every(s => s.done) };
}
