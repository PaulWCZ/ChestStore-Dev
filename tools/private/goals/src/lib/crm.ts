import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { refreshFed } from "./sources.ts";

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
// Anything of another shape is accepted and ignored. The other tools'
// sources, and the one refresh of every fed value, are lib/sources.ts.

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
