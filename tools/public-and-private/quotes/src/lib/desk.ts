import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query } from "./db.ts";
import { collectable, listDocuments, type ListRow } from "./documents.ts";
import { addDays } from "../shared/model.ts";
import { totalsBy, type Totals } from "../shared/money.ts";

// The desk: what the company waits for (quotes sent, money to collect), what
// is late, and what needs someone now — each list short, the oldest first.

// Each figure is one amount per currency (SDK 0.7.0: no Chest currency;
// amounts of different currencies are never added), the tool's default
// first.
export type Desk = {
  waiting: { count: number; net: Totals };
  toCollect: { count: number; due: Totals };
  overdue: { count: number; due: Totals };
  needs: { row: ListRow; reason: "ready" | "overdue" | "expiring" | "expired" | "accepted" | "draft" | "crm" }[];
  recent: ListRow[];
  empty: boolean;
};

export async function desk(sql: Query, actor: Member, today: string, currency = "EUR"): Promise<Desk> {
  const all = await listDocuments(sql, actor, { types: ["quote", "invoice", "credit"], limit: 2000 }, today);
  const waitingQuotes = all.filter(r => r.type === "quote" && r.state === "sent");
  const open = all.filter(r => collectable(r) && r.due > 0 && r.state !== "credited");
  const late = open.filter(r => r.state === "overdue");
  const needs: Desk["needs"] = [];
  const issuer = can(actor, "invoices.issue");
  for (const r of all) {
    if (r.type === "invoice" && r.status === "draft" && r.readyAt && issuer) needs.push({ row: r, reason: "ready" });
  }
  for (const r of late.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))) needs.push({ row: r, reason: "overdue" });
  const invoicedQuotes = new Set(all.filter(r => r.type === "invoice" && r.quoteId).map(r => r.quoteId));
  for (const r of all.filter(r => r.type === "quote" && r.state === "accepted" && !invoicedQuotes.has(r.id))) needs.push({ row: r, reason: "accepted" });
  for (const r of waitingQuotes.filter(r => r.validUntil !== null && r.validUntil <= addDays(today, 7))) needs.push({ row: r, reason: "expiring" });
  if (can(actor, "quotes.write")) for (const r of all.filter(r => r.type === "quote" && r.status === "draft" && r.crmTitle && (r.createdBy === actor.id || r.createdBy === "tool:crm"))) needs.push({ row: r, reason: "crm" });
  for (const r of all.filter(r => r.status === "draft" && r.createdBy === actor.id && !r.readyAt && !r.crmTitle)) needs.push({ row: r, reason: "draft" });
  return {
    waiting: { count: waitingQuotes.length, net: totalsBy(waitingQuotes, r => r.currency, r => r.net, currency) },
    toCollect: { count: open.length, due: totalsBy(open, r => r.currency, r => r.due, currency) },
    overdue: { count: late.length, due: totalsBy(late, r => r.currency, r => r.due, currency) },
    needs: needs.slice(0, 12),
    recent: all.filter(r => r.status !== "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    empty: all.length === 0,
  };
}
