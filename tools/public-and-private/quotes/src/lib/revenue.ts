import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import type { Query } from "./db.ts";

// Revenue at a glance ("chiffre d'affaires"), the boss's Monday question:
// this month's sales excluding VAT against last month and the same month a
// year ago, and since the 1st of January by client and by salesperson.
//
// What counts is what the accounting entries count as sales (lib/journal.ts,
// accounts 706/707): the lines of the invoices issued here, less their
// credit notes, by their issue date. A deposit invoice is not a sale yet (it
// goes to the deposits received): it counts when the final invoice is
// issued, whose lines taking deposits back are left out too — so a quote
// invoiced in two times counts once, in full, in the month of its final
// invoice. Invoices imported from the previous tool are not counted (they
// were that tool's sales). Only the Chest's currency.
//
// The salesperson is who wrote the quote an invoice came from, else who
// wrote the invoice (a credit note: its invoice's). Who may read it: whoever
// reads the books (`export`: administrators, billing, the accountant's
// seat) — not each salesperson.

export type Revenue = {
  month: string;
  thisMonth: number;
  lastMonth: number;
  lastMonthKey: string;
  lastYear: number;
  lastYearKey: string;
  yearToDate: number;
  byClient: { name: string; net: number }[];
  bySeller: { id: string; net: number }[];
};

const monthBefore = (month: string): string => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export async function revenue(sql: Query, actor: Member | null, today: string, currency: string): Promise<Revenue | null> {
  if (!can(actor, "export")) return null;
  const month = today.slice(0, 7);
  const lastMonthKey = monthBefore(month);
  const lastYearKey = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const yearStart = `${month.slice(0, 4)}-01-01`;
  const from = [`${lastYearKey}-01`, `${lastMonthKey}-01`, yearStart].sort()[0]!;
  const rows = await sql<{ type: "invoice" | "credit"; day: string; client: string; seller: string; sales: number }[]>`
    select d.type, d.issue_date as day, coalesce(d.buyer->>'name', cl.name, '') as client,
           coalesce(q.created_by, iq.created_by, i.created_by, d.created_by) as seller,
           coalesce(sum(l.net) filter (where l.kind = 'line' and l.deposit_of is null), 0)::bigint as sales
    from documents d
    left join clients cl on cl.id = d.client_id
    left join documents i on i.id = d.invoice_id
    left join documents q on q.id = d.quote_id
    left join documents iq on iq.id = i.quote_id
    left join lines l on l.document_id = d.id
    where d.type in ('invoice', 'credit') and d.status = 'final' and d.deleted_at is null and d.currency = ${currency}
      and d.deposit_percent is null and (d.type = 'invoice' or i.deposit_percent is null)
      and d.issue_date >= ${from} and d.issue_date <= ${today}
    group by d.id, cl.name, q.created_by, iq.created_by, i.created_by`;
  let thisMonth = 0, lastMonth = 0, lastYear = 0, yearToDate = 0;
  const clients = new Map<string, number>();
  const sellers = new Map<string, number>();
  for (const r of rows) {
    const net = r.type === "credit" ? -r.sales : r.sales;
    const key = r.day.slice(0, 7);
    if (key === month) thisMonth += net;
    if (key === lastMonthKey) lastMonth += net;
    if (key === lastYearKey) lastYear += net;
    if (r.day >= yearStart) {
      yearToDate += net;
      clients.set(r.client, (clients.get(r.client) ?? 0) + net);
      sellers.set(r.seller, (sellers.get(r.seller) ?? 0) + net);
    }
  }
  const top = <T>(m: Map<string, number>, shape: (k: string, net: number) => T) =>
    [...m.entries()].filter(([, net]) => net !== 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([k, net]) => shape(k, net));
  return {
    month, thisMonth, lastMonth, lastMonthKey, lastYear, lastYearKey, yearToDate,
    byClient: top(clients, (name, net) => ({ name, net })),
    bySeller: top(sellers, (id, net) => ({ id, net })),
  };
}

// The change from one figure to another, in whole percents (null when the
// first is nothing: no percent of nothing).
export function change(before: number, after: number): number | null {
  if (before <= 0) return null;
  return Math.round(((after - before) / before) * 100);
}
