import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Query, Sql } from "./db.ts";
import { addDays } from "./model.ts";
import { zone } from "./time.ts";
import { instantOf } from "./zone.ts";

// Key results fed by Clients, the CRM (Proposal (studio): events between
// tools, once an admin linked the two in the Chest). Clients tells each
// deal won and each won deal reopened; Goals keeps only what a key result
// needs — the deal's reference, amount, currency and when it was won —
// and sets the value of every key result fed by it: the amount won, or the
// number of deals won, between its cycle's first and last day (the Chest's
// calendar). Nobody types it; the owner's weekly check-in still says how
// sure they are.
//
// What this cannot know: deals won before the two tools were linked (the
// Chest delivers events from then on). Reading the CRM's past needs a
// query between tools (reports/03-sdk-report.md).
//
// Data, as Clients publishes it (tools/private/crm/lib/share.ts):
//   crm.deal.won      { deal, title, amount: cents | null, currency, company, contact, owner }
//   crm.deal.reopened { deal }
// Anything of another shape is accepted and ignored.

export const sources = ["crm.won_amount", "crm.won_count"] as const;
export type Source = (typeof sources)[number];
export const isSource = (value: unknown): value is Source => typeof value === "string" && (sources as readonly string[]).includes(value);

const refPattern = /^[A-Za-z0-9._:-]{1,64}$/u;

export async function dealWon(sql: Sql, event: ToolEvent): Promise<void> {
  const { deal, amount, currency } = event.data as Record<string, unknown>;
  if (typeof deal !== "string" || !refPattern.test(deal)) return;
  const cents = typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 && amount <= 1e14 ? amount : null;
  const code = typeof currency === "string" && /^[A-Z]{3}$/u.test(currency) ? currency : null;
  const at = Number.isNaN(Date.parse(event.occurredAt)) ? new Date() : new Date(event.occurredAt);
  await sql`
    insert into crm_deals (deal, amount_cents, currency, won_at) values (${deal}, ${cents}, ${code}, ${at})
    on conflict (deal) do update set amount_cents = excluded.amount_cents, currency = excluded.currency, won_at = excluded.won_at, updated_at = now()`;
  await refreshFed(sql);
}

export async function dealReopened(sql: Sql, event: ToolEvent): Promise<void> {
  const { deal } = event.data as Record<string, unknown>;
  if (typeof deal !== "string" || !refPattern.test(deal)) return;
  await sql`update crm_deals set won_at = null, updated_at = now() where deal = ${deal}`;
  await refreshFed(sql);
}

// Every fed key result of the cycles not closed, set to what the CRM says
// (or only those given).
export async function refreshFed(sql: Query, keyResultIds?: string[]): Promise<number> {
  const rows = await sql<{ id: string; source: Source; currency: string | null; starts_on: string; ends_on: string }[]>`
    select k.id, k.source, k.currency, to_char(y.starts_on, 'YYYY-MM-DD') as starts_on, to_char(y.ends_on, 'YYYY-MM-DD') as ends_on
    from key_results k join objectives o on o.id = k.objective_id join cycles y on y.id = o.cycle_id
    where k.source is not null and k.archived_at is null and o.archived_at is null and y.closed_at is null
      ${keyResultIds ? sql`and k.id in ${sql(keyResultIds.length ? keyResultIds : ["0"])}` : sql``}`;
  const z = zone();
  for (const r of rows) {
    const from = instantOf(r.starts_on, 0, z), to = instantOf(addDays(r.ends_on, 1), 0, z);
    const [{ total, n }] = (await sql<{ total: string | null; n: string }[]>`
      select sum(amount_cents) filter (where currency = ${r.currency ?? ""}) as total, count(*) as n
      from crm_deals where won_at >= ${from} and won_at < ${to}`) as unknown as [{ total: string | null; n: string }];
    const value = r.source === "crm.won_amount" ? Math.round(Number(total ?? 0)) / 100 : Number(n);
    await sql`update key_results set current_value = ${value} where id = ${r.id} and current_value <> ${value}`;
  }
  return rows.length;
}
