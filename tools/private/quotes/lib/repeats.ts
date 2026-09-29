import type { Member } from "@argentic/chest-sdk/member";
import { can, issuers } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { linesOf } from "./documents.ts";
import { format } from "./i18n/index.ts";
import { day, id, oneOf } from "./model.ts";
import { formatMoney } from "./money.ts";
import { notify } from "./notify.ts";
import { holders } from "./people.ts";
import { lineNet, totals } from "./totals.ts";

// Recurring invoices — the maintenance contract, the monthly subscription:
// an issued invoice is made again every month, quarter or year, as a draft
// with the same client, subject and lines, handed to billing on its day
// (they hear of it in the bell). Never finalised by itself: someone checks
// the period in the subject and finalises it, as with any draft. Made each
// morning (the "followup" schedule) or at the first visit of the day; a
// day missed while the tool was asleep is made the next time, never twice.

export const repeatEvery = ["month", "quarter", "year"] as const;
export type Every = (typeof repeatEvery)[number];
const months: Record<Every, number> = { month: 1, quarter: 3, year: 12 };

// A day n months later, the day of the month kept when it exists (the 31st
// becomes the last day of a shorter month).
export function addMonths(start: string, n: number): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const index = (y * 12 + (m - 1)) + n;
  const year = Math.floor(index / 12), month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export type Repeat = { id: string; sourceId: string; every: Every; startsOn: string; nextOn: string; active: boolean; made: number; createdBy: string };
type Row = { id: number; source_id: number; every: Every; starts_on: string; next_on: string; active: boolean; made: number; created_by: string };
const toRepeat = (r: Row): Repeat => ({ id: String(r.id), sourceId: String(r.source_id), every: r.every, startsOn: r.starts_on, nextOn: r.next_on, active: r.active, made: r.made, createdBy: r.created_by });

// The repeat of an invoice (the active one), or the one a draft was made by.
export async function repeatOf(sql: Query, documentId: string): Promise<{ repeat: Repeat; sourceNumber: string | null } | null> {
  const [row] = await sql<(Row & { number: string | null })[]>`
    select r.*, s.number from repeats r join documents s on s.id = r.source_id
    where (r.source_id = ${documentId} and r.active) or r.id = (select repeat_id from documents where id = ${documentId})
    order by r.active desc, r.id desc limit 1`;
  return row ? { repeat: toRepeat(row), sourceNumber: row.number } : null;
}

// repeatInvoice: from this issued invoice, a new draft every period from
// the day given (by default one period after the invoice's date, or the
// next such day to come).
export async function repeatInvoice(sql: Sql, actor: Member | null, invoiceId: unknown, every: unknown, startsOn: unknown, today: string): Promise<Repeat> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  const period = oneOf(repeatEvery, every);
  const docId = id(invoiceId);
  return sql.begin(async tx => {
    const [source] = await tx<{ id: number; type: string; status: string; deposit_percent: number | null; issue_date: string | null; deleted_at: Date | null }[]>`
      select id, type, status, deposit_percent, issue_date, deleted_at from documents where id = ${docId} for update`;
    if (!source || source.deleted_at || source.type !== "invoice") throw new AppError("not_found");
    if (source.status !== "final" || source.deposit_percent !== null) throw new AppError("repeat_invalid");
    let start = startsOn === undefined || startsOn === null || startsOn === "" ? addMonths(source.issue_date ?? today, months[period]) : day(startsOn);
    if (start <= today) {
      if (startsOn !== undefined && startsOn !== null && startsOn !== "") throw new AppError("date_invalid");
      let k = 1;
      while (start <= today && k < 1200) start = addMonths(source.issue_date ?? today, months[period] * ++k);
    }
    await tx`update repeats set active = false, updated_at = now() where source_id = ${docId} and active`;
    const [row] = await tx<Row[]>`
      insert into repeats (source_id, every, starts_on, next_on, created_by) values (${docId}, ${period}, ${start}, ${start}, ${actor!.id}) returning *`;
    return toRepeat(row!);
  });
}

export async function stopRepeat(sql: Sql, actor: Member | null, repeatId: unknown): Promise<void> {
  if (!can(actor, "invoices.issue")) throw new AppError("forbidden");
  const rows = await sql`update repeats set active = false, updated_at = now() where id = ${id(repeatId)} and active returning id`;
  if (rows.length === 0) throw new AppError("not_found");
}

// makeDueDrafts: the drafts whose day has come, each handed to billing.
// Twelve at most per repeat and run (a year of a monthly one).
export async function makeDueDrafts(sql: Sql, today: string): Promise<number> {
  const made: { id: string; client: string; number: string; currency: string; gross: number }[] = [];
  await sql.begin(async tx => {
    const due = await tx<(Row & { client_id: number | null; client_archived: boolean; title: string; language: string; currency: string; payment_days: number; vat_treatment: string; franchise: boolean; notes: string; number: string | null; client_name: string | null })[]>`
      select r.*, s.client_id, (c.archived_at is not null) as client_archived, s.title, s.language, s.currency, s.payment_days, s.vat_treatment, s.notes, s.number, c.name as client_name,
        (select vat_regime = 'franchise' from company where id = 1) as franchise
      from repeats r join documents s on s.id = r.source_id left join clients c on c.id = s.client_id
      where r.active and r.next_on <= ${today}
      order by r.next_on, r.id
      for update of r skip locked`;
    for (const r of due) {
      // A deposit taken back once is not taken back again.
      const lines = (await linesOf(tx, String(r.source_id))).filter(l => !l.depositOf);
      let next = r.next_on;
      let count = r.made;
      for (let k = 0; k < 12 && next <= today; k++) {
        const [doc] = await tx<{ id: number }[]>`
          insert into documents (type, client_id, title, language, currency, payment_days, vat_treatment, franchise, notes, created_by, ready_at, repeat_id)
          values ('invoice', ${r.client_archived ? null : r.client_id}, ${r.title}, ${r.language}, ${r.currency}, ${r.payment_days}, ${r.vat_treatment}, ${r.franchise}, ${r.notes}, ${r.created_by}, now(), ${r.id})
          returning id`;
        const kept = lines.map((l, i) => ({
          document_id: doc!.id, position: i + 1, kind: l.kind, item_id: l.itemId === null ? null : Number(l.itemId), description: l.description, quantity: l.quantity, unit: l.unit,
          unit_price: l.unitPrice, discount: l.discount, vat_rate: l.vatRate, goods: l.goods, net: l.kind === "line" ? lineNet(l) : 0,
        }));
        if (kept.length > 0) await tx`insert into lines ${tx(kept)}`;
        const t = totals(lines, { noVat: r.franchise || r.vat_treatment === "reverse_charge" });
        await tx`update documents set net = ${t.net}, vat = ${t.vat}, gross = ${t.gross}, rates = ${tx.json(t.rates as never)} where id = ${doc!.id}`;
        count++;
        next = addMonths(r.starts_on, months[r.every] * count);
        made.push({ id: String(doc!.id), client: r.client_name ?? "", number: r.number ?? "", currency: r.currency, gross: t.gross });
      }
      await tx`update repeats set next_on = ${next}, made = ${count}, updated_at = now() where id = ${r.id}`;
    }
  });
  if (made.length > 0) {
    const billing = [...new Set((await Promise.all(issuers.map(role => holders({ role })))).flat().map(h => h.id))];
    for (const m of made) {
      await notify(billing, (t, locale) => ({
        title: format(t.notifications.repeatTitle, { client: m.client }),
        body: format(t.notifications.repeatBody, { number: m.number, amount: formatMoney(m.gross, m.currency, locale) }),
      }), { path: `/chest/documents/${m.id}`, key: `ready:${m.id}` });
    }
  }
  return made.length;
}
