import type { Member } from "@argentic/chest-sdk/member";
import { can, expenseAccess } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { expensesByIds, type Expense } from "./expenses.ts";

// Search: every expense the actor may see — their own (drafts too), those
// they approve, and for the accountants every expense that was sent — by
// what people type: a shop or a word of the note ("Big Mamma"), a place of
// a trip, an amount ("187,60", "187.6", or "187" for any amount of 187 and
// cents), a reference ("E123"), a person's name or a category's (the caller
// turns names into member and category ids: people's names are the
// Chest's, built-in categories are named in each reader's language).
// Newest first, 100 at most.

export const searchLimit = 100;
export const queryMax = 100;

// What the text asks for: a reference, an amount in cents (exact, or a
// whole number of units), and the text itself.
export type SearchQuery = { text: string; reference: string | null; cents: number | null; whole: number | null };

export function readQuery(value: unknown): SearchQuery | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim().slice(0, queryMax);
  if (text.length < 2 && !/^\d$/u.test(text)) return null;
  const ref = /^e\s?(\d{1,18})$/iu.exec(text);
  const number = /^(?:€\s?)?(\d{1,7})(?:[.,](\d{1,2}))?(?:\s?€|\s?eur)?$/iu.exec(text.replace(/[   ](?=\d{3}\b)/gu, ""));
  const units = number ? Number(number[1]) : null;
  const cents = number && number[2] !== undefined ? Number(number[1]) * 100 + Number(number[2].padEnd(2, "0")) : null;
  return { text, reference: ref ? ref[1]! : /^\d{1,18}$/u.test(text) ? text : null, cents, whole: number && number[2] === undefined ? units : null };
}

const like = (text: string) => "%" + text.replace(/[\\%_]/gu, m => "\\" + m) + "%";

export async function search(sql: Query, actor: Member | null, queryValue: unknown, named: { people?: string[]; categories?: string[] } = {}): Promise<Expense[]> {
  if (!actor || !can(actor, "own")) throw new AppError("forbidden");
  const q = readQuery(queryValue);
  if (!q) return [];
  const all = can(actor, "see.all");
  const approver = can(actor, "approve");
  const pattern = like(q.text);
  const people = (named.people ?? []).filter(p => typeof p === "string" && p.startsWith("mbr_")).slice(0, 200);
  const cats = (named.categories ?? []).filter(c => /^[1-9][0-9]{0,17}$/u.test(c)).slice(0, 100);
  const rows = await sql<{ id: string; member_id: string; status: string; approver_id: string | null; assigned: string | null }[]>`
    select e.id, e.member_id, e.status, e.approver_id, a.approver_id as assigned
    from expenses e left join approvers a on a.member_id = e.member_id
    where e.deleted_at is null
      and (e.member_id = ${actor.id}
           or (e.status <> 'draft' and (${all} or (${approver} and (e.approver_id = ${actor.id} or a.approver_id = ${actor.id})))))
      and (e.merchant ilike ${pattern} or e.note ilike ${pattern} or e.from_place ilike ${pattern} or e.to_place ilike ${pattern}
           or e.member_id = any(${people}::text[]) or e.category_id::text = any(${cats}::text[])
           ${q.reference ? sql`or e.id::text = ${q.reference}` : sql``}
           ${q.cents !== null ? sql`or e.amount_cents = ${q.cents} or e.base_cents = ${q.cents}` : sql``}
           ${q.whole !== null ? sql`or e.amount_cents / 100 = ${q.whole} or e.base_cents / 100 = ${q.whole}` : sql``})
    order by e.spent_on desc, e.id desc
    limit ${searchLimit}`;
  // The rights, once more, as everywhere else (lib/access.ts).
  const seen = rows.filter(r => expenseAccess(actor, { owner: r.member_id, status: r.status, approver: r.approver_id, assignedTo: r.assigned }).see).map(r => String(r.id));
  const found = await expensesByIds(sql, seen);
  const order = new Map(seen.map((id, i) => [id, i]));
  return found.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
