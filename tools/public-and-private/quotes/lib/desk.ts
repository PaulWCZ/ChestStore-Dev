import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query } from "./db.ts";
import { listDocuments, type ListRow } from "./documents.ts";
import { addDays } from "./model.ts";

// The desk: what the company waits for (quotes sent, money to collect), what
// is late, and what needs someone now — each list short, the oldest first.

export type Desk = {
  waiting: { count: number; net: number };
  toCollect: { count: number; due: number };
  overdue: { count: number; due: number };
  needs: { row: ListRow; reason: "ready" | "overdue" | "expiring" | "expired" | "accepted" | "draft" | "crm" }[];
  recent: ListRow[];
  empty: boolean;
  currency: string | null;
};

export async function desk(sql: Query, actor: Member, today: string): Promise<Desk> {
  const all = await listDocuments(sql, actor, { types: ["quote", "invoice", "credit"], limit: 2000 }, today);
  const waitingQuotes = all.filter(r => r.type === "quote" && r.state === "sent");
  const open = all.filter(r => r.type === "invoice" && r.status === "final" && r.due > 0 && r.state !== "credited");
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
    waiting: { count: waitingQuotes.length, net: waitingQuotes.reduce((s, r) => s + r.net, 0) },
    toCollect: { count: open.length, due: open.reduce((s, r) => s + r.due, 0) },
    overdue: { count: late.length, due: late.reduce((s, r) => s + r.due, 0) },
    needs: needs.slice(0, 12),
    recent: all.filter(r => r.status !== "draft").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    empty: all.length === 0,
    currency: all[0]?.currency ?? null,
  };
}
