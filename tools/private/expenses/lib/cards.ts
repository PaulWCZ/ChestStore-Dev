import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { match, merchantFromLabel, type Candidate, type CardPayment } from "./card-match.ts";
import type { Query, Sql } from "./db.ts";
import { clean, id, limits, today } from "./model.ts";
import { convert, isCurrency } from "./money.ts";
import { guessCategory } from "./card-guess.ts";
import { cardRules, categories, settings } from "./settings.ts";

// Company card statements: the accountant imports the month's card export
// (read and mapped in the browser: lib/card-read.ts). Each card payment is
// matched to the expense its holder already added (lib/card-match.ts); a
// payment without one becomes a draft of its holder, paid with the company
// card, waiting for its receipt ("Receipt needed" in their "To send"). The
// holder is asked for it (lib/tell.ts, cardReceipts). A payment imported
// again (overlapping statements) is recognised and left out. Undo takes a
// statement back while nobody touched what it made.

export type StatementLine = { date?: unknown; label?: unknown; amount?: unknown; currency?: unknown; member?: unknown };
export type StatementResult = { statement: string; payments: number; matched: number; created: number; known: number; owners: string[] };

const isDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

// The key of one payment: its holder, day, amount, currency, label, and its
// rank among identical ones in the file (two coffees at the same place on
// the same day are two payments).
function keyOf(member: string, day: string, amount: number, currency: string, label: string, rank: number): string {
  return createHash("sha256").update(JSON.stringify([member, day, amount, currency, label.toLowerCase(), rank])).digest("hex");
}

export async function importStatement(sql: Sql, actor: Member | null, input: { fileName?: unknown; lines?: unknown }, holders: Set<string>): Promise<StatementResult> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  if (!Array.isArray(input.lines)) throw new AppError("invalid");
  if (input.lines.length === 0) throw new AppError("statement_empty");
  if (input.lines.length > limits.importLines) throw new AppError("too_many", { max: limits.importLines });
  const fileName = clean(typeof input.fileName === "string" ? input.fileName.slice(0, limits.fileName) : "", limits.fileName, { optional: true });
  const last = today();
  const ranks = new Map<string, number>();
  const payments: (CardPayment & { day: string })[] = [];
  for (const raw of input.lines as StatementLine[]) {
    const member = raw?.member;
    if (typeof member !== "string" || !holders.has(member)) throw new AppError("invalid");
    if (!isDay(raw.date) || raw.date < "2000-01-01" || raw.date > last) throw new AppError("date_invalid");
    const amount = raw.amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > limits.amount) throw new AppError("amount_invalid");
    const currency = raw.currency;
    if (!isCurrency(currency)) throw new AppError("currency_invalid");
    const label = clean(typeof raw.label === "string" ? raw.label.slice(0, 400) : "", 400, { optional: true }).slice(0, 200);
    const base = JSON.stringify([member, raw.date, amount, currency, label.toLowerCase()]);
    const rank = ranks.get(base) ?? 0;
    ranks.set(base, rank + 1);
    payments.push({ key: keyOf(member, raw.date, amount, currency, label, rank), member, date: raw.date, day: raw.date, label, amount, currency });
  }
  const company = await settings(sql);
  const cats = await categories(sql);
  const other = cats.find(c => c.key === "other") ?? cats.find(c => !c.mileage && c.key !== "allowance");
  if (!other) throw new AppError("category_invalid");
  // The label's words say what it was for, when a rule knows them
  // (lib/card-guess.ts); "Other" otherwise.
  const rules = await cardRules(sql);
  return sql.begin(async tx => {
    // Payments already imported (an overlapping statement) are left out.
    const known = new Set((await tx<{ member_id: string; line_key: string }[]>`
      select member_id, line_key from card_lines where line_key = any(${payments.map(p => p.key)}::text[])`).map(r => `${r.member_id}:${r.line_key}`));
    const fresh = payments.filter(p => !known.has(`${p.member}:${p.key}`));
    const [statement] = await tx<{ id: string }[]>`insert into card_statements (created_by, file_name) values (${actor!.id}, ${fileName}) returning id`;
    const result: StatementResult = { statement: String(statement!.id), payments: fresh.length, matched: 0, created: 0, known: payments.length - fresh.length, owners: [] };
    if (fresh.length === 0) return result;
    // Candidates: each holder's expenses around those days not yet tied to
    // a card payment (drafts, sent, approved or paid; never imported
    // history or deleted drafts).
    const days = fresh.map(p => p.day).sort();
    const from = shift(days[0]!, -10), to = shift(days.at(-1)!, 10);
    const rows = await tx<{ id: string; member_id: string; spent_on: string; merchant: string; amount_cents: string; currency: string; base_cents: string | null; base_currency: string | null }[]>`
      select e.id, e.member_id, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, e.merchant, e.amount_cents, e.currency, e.base_cents, e.base_currency
      from expenses e
      where e.member_id = any(${[...new Set(fresh.map(p => p.member))]}::text[]) and e.kind = 'expense' and e.deleted_at is null and e.imported_at is null
        and e.spent_on between ${from} and ${to}
        and not exists (select 1 from card_lines c where c.expense_id = e.id)
      for update of e`;
    const candidates: Candidate[] = rows.map(r => ({ id: String(r.id), member: r.member_id, date: r.spent_on, merchant: r.merchant, amount: Number(r.amount_cents), currency: r.currency, base: r.base_cents === null ? null : Number(r.base_cents), baseCurrency: r.base_currency }));
    const pairs = match(fresh, candidates);
    const rateOf = new Map<string, number>();
    for (const r of await tx<{ currency: string; rate_micro: string }[]>`select currency, rate_micro from rates`) rateOf.set(r.currency, Number(r.rate_micro));
    const owners = new Set<string>();
    for (const p of fresh) {
      let expenseId = pairs.get(p.key) ?? null;
      let link: "matched" | "created" = "matched";
      if (expenseId === null) {
        // No expense yet: a draft of the holder, paid with the company card,
        // waiting for its receipt; its category guessed from the label.
        const category = guessCategory(p.label, rules) ?? other.id;
        const rate = p.currency === company.currency ? null : rateOf.get(p.currency) ?? null;
        const base = p.currency === company.currency ? p.amount : rate ? convert(p.amount, p.currency, rate, company.currency) : null;
        const [created] = await tx<{ id: string }[]>`
          insert into expenses (member_id, kind, spent_on, amount_cents, currency, category_id, merchant, paid_by, rate_micro, rate_source, base_cents, base_currency)
          values (${p.member}, 'expense', ${p.day}, ${p.amount}, ${p.currency}, ${category}, ${merchantFromLabel(p.label)}, 'company',
                  ${rate}, ${rate ? "company" : null}, ${base}, ${base === null ? null : company.currency})
          returning id`;
        expenseId = String(created!.id);
        link = "created";
        await tx`insert into history (expense_id, actor, kind, detail) values (${expenseId}, ${actor!.id}, 'created', 'card')`;
        owners.add(p.member);
        result.created++;
      } else result.matched++;
      await tx`
        insert into card_lines (statement_id, member_id, spent_on, label, amount_cents, currency, line_key, expense_id, link)
        values (${statement!.id}, ${p.member}, ${p.day}, ${p.label}, ${p.amount}, ${p.currency}, ${p.key}, ${expenseId}, ${link})`;
    }
    result.owners = [...owners];
    return result;
  });
}

function shift(day: string, days: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

// undoStatement takes a statement back (the toast's Undo): its payments go,
// and the drafts it made with them — as long as none was changed, sent,
// given a receipt or deleted since. Answers the holders whose drafts went.
export async function undoStatement(sql: Sql, actor: Member | null, statementValue: unknown): Promise<string[]> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const sid = id(statementValue);
  return sql.begin(async tx => {
    const [statement] = await tx<{ id: string }[]>`select id from card_statements where id = ${sid} for update`;
    if (!statement) throw new AppError("not_found");
    const made = await tx<{ id: string; member_id: string; status: string; receipt_object: string | null; deleted_at: Date | null; edited: boolean }[]>`
      select e.id, e.member_id, e.status, e.receipt_object, e.deleted_at,
        exists (select 1 from history h where h.expense_id = e.id and h.kind <> 'created') as edited
      from card_lines c join expenses e on e.id = c.expense_id
      where c.statement_id = ${sid} and c.link = 'created' for update of e`;
    if (made.some(e => e.status !== "draft" || e.receipt_object !== null || e.deleted_at !== null || e.edited)) throw new AppError("statement_touched");
    await tx`delete from card_statements where id = ${sid}`;
    if (made.length > 0) await tx`delete from expenses where id = any(${made.map(e => e.id)}::bigint[])`;
    return [...new Set(made.map(e => e.member_id))];
  });
}

// What the accountant follows on the cards page.
// waiting: drafts made for a payment, still without a receipt;
// check: a payment matched to an expense its owner said they paid with
// their own money (it must not be paid back twice), or whose draft its
// holder deleted (personal spending on the company card?).
export type CardLineView = { id: string; member: string; date: string; label: string; amount: number; currency: string; expense: string | null; status: string | null };
export type CardOverview = {
  waiting: CardLineView[];
  ownMoney: CardLineView[];
  deleted: CardLineView[];
  statements: { id: string; createdAt: string; createdBy: string; fileName: string; payments: number; matched: number; created: number; done: number }[];
};

export async function cardOverview(sql: Query, actor: Member | null): Promise<CardOverview> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  const lines = await sql<{ id: string; member_id: string; spent_on: string; label: string; amount_cents: string; currency: string; expense_id: string | null; link: string | null; status: string | null; paid_by: string | null; receipt: boolean; deleted: boolean; checked: boolean }[]>`
    select c.id, c.checked_at is not null as checked, c.member_id, to_char(c.spent_on, 'YYYY-MM-DD') as spent_on, c.label, c.amount_cents, c.currency, c.expense_id, c.link,
      e.status, e.paid_by, e.receipt_object is not null as receipt, e.deleted_at is not null as deleted
    from card_lines c left join expenses e on e.id = c.expense_id
    where c.member_id <> 'erased' and c.spent_on > (current_date - 400)
    order by c.spent_on, c.id`;
  const view = (l: (typeof lines)[number]): CardLineView => ({ id: String(l.id), member: l.member_id, date: l.spent_on, label: l.label, amount: Number(l.amount_cents), currency: l.currency, expense: l.expense_id === null ? null : String(l.expense_id), status: l.status });
  const statements = await sql<{ id: string; created_at: Date; created_by: string; file_name: string; payments: string; matched: string; created: string; done: string }[]>`
    select s.id, s.created_at, s.created_by, s.file_name, count(c.id) as payments,
      count(c.id) filter (where c.link = 'matched') as matched, count(c.id) filter (where c.link = 'created') as created,
      count(c.id) filter (where e.receipt_object is not null and e.deleted_at is null) as done
    from card_statements s left join card_lines c on c.statement_id = s.id left join expenses e on e.id = c.expense_id
    where s.created_at > now() - interval '120 days'
    group by s.id order by s.created_at desc, s.id desc limit 12`;
  return {
    waiting: lines.filter(l => l.link === "created" && l.expense_id !== null && !l.deleted && !l.receipt && l.status === "draft").map(view),
    ownMoney: lines.filter(l => !l.checked && l.link === "matched" && l.paid_by === "me" && !l.deleted).map(view),
    deleted: lines.filter(l => !l.checked && (l.expense_id === null || l.deleted)).map(view),
    statements: statements.map(s => ({ id: String(s.id), createdAt: s.created_at.toISOString(), createdBy: s.created_by, fileName: s.file_name, payments: Number(s.payments), matched: Number(s.matched), created: Number(s.created), done: Number(s.done) })),
  };
}

// The holders who still owe receipts for card payments, and how many.
export async function receiptsOwed(sql: Query, members?: string[]): Promise<Map<string, number>> {
  const rows = await sql<{ member_id: string; n: string }[]>`
    select e.member_id, count(*) as n from card_lines c join expenses e on e.id = c.expense_id
    where c.link = 'created' and e.status = 'draft' and e.deleted_at is null and e.receipt_object is null and e.member_id <> 'erased'
      ${members ? sql`and e.member_id = any(${members}::text[])` : sql``}
    group by e.member_id`;
  return new Map(rows.map(r => [r.member_id, Number(r.n)]));
}

// checkLine clears a payment the accountant looked at from "To check"
// (Undo brings it back: `checked` false).
export async function checkLine(sql: Sql, actor: Member | null, lineValue: unknown, checked: unknown): Promise<void> {
  if (!can(actor, "pay")) throw new AppError("forbidden");
  if (typeof checked !== "boolean") throw new AppError("invalid");
  const lid = id(lineValue);
  const [row] = await sql`
    update card_lines set checked_at = case when ${checked}::boolean then now() end, checked_by = ${checked ? actor!.id : null}
    where id = ${lid} and member_id <> 'erased' returning id`;
  if (!row) throw new AppError("not_found");
}
