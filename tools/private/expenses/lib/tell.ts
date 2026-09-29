import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { waitingCounts, totals, type Decision, type Expense, type Total } from "./expenses.ts";
import { format, formatDate, plural, shortDate } from "./i18n/index.ts";
import { formatMoney } from "./money.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { receiptsOwed } from "./cards.ts";
import { email } from "./mail.ts";
import { accountants } from "./people.ts";

// What Expenses tells people through the Chest's bell, each in their own
// language, and the number on its tile: what waits for them. Keys make a
// new item replace the old one, and let it go once it is settled.

export function totalText(list: Total[], locale: string): string {
  return list.map(t => formatMoney(t.amount, t.currency, locale)).join(" + ");
}

function what(e: Expense, locale: string): string {
  const amount = formatMoney(e.amount, e.currency, locale);
  const place = e.trip ? `${e.trip.from} → ${e.trip.to}` : e.merchant;
  return place ? `${place} · ${amount}` : amount;
}

// Someone sent expenses: their approver (or the accountants) hears of it,
// in the bell and by email.
export async function sent(sql: Query, actor: Member, result: { claim?: string; approver: string | null; expenses: Expense[] }): Promise<void> {
  const recipients = result.approver ? [result.approver] : (await accountants()).filter(a => a !== actor.id);
  const sum = totals(result.expenses);
  await notify(recipients, (t, locale) => ({
    title: plural(t.bell.sent, result.expenses.length, locale, { name: actor.name, total: totalText(sum, locale) }),
    body: cut(result.expenses.map(e => what(e, locale)).join("\n"), 280),
  }), { path: "/chest/approve", key: `waiting:${actor.id}` });
  await email(recipients, (t, locale) => ({
    subject: plural(t.mail.sent, result.expenses.length, locale, { name: actor.name, total: totalText(sum, locale) }),
    lines: [plural(t.mail.sentLine, result.expenses.length, locale, { name: actor.name }), "", ...result.expenses.map(e => `${shortDate(e.spentOn, locale)} · ${what(e, locale)}`)],
  }), { path: "/chest/approve", key: `sent:${result.claim ?? createHash("sha256").update(result.expenses.map(e => e.id).join(",")).digest("hex").slice(0, 24)}` });
  // Refused expenses sent again no longer need their owner's look.
  for (const e of result.expenses) await withdraw(`refused:${e.id}`, [actor.id]);
  await refresh(sql, [actor.id, ...recipients]);
}

// Expenses were approved or refused: their owners hear of it; the approvers'
// item goes once nothing of that person waits.
export async function decided(sql: Query, actor: Member, decisions: Decision[], verdict: "approve" | "refuse", reason = ""): Promise<void> {
  for (const d of decisions) {
    if (d.owner === actor.id || d.owner === "erased") continue;
    if (verdict === "approve") {
      const sum = totals(d.expenses);
      await notify([d.owner], (t, locale) => ({
        title: plural(t.bell.approved, d.expenses.length, locale, { name: actor.name, total: totalText(sum, locale) }),
        body: cut(d.expenses.map(e => what(e, locale)).join("\n"), 280),
      }), { path: "/chest", key: `approved:${d.owner}` });
    } else {
      for (const e of d.expenses) {
        await notify([d.owner], (t, locale) => ({ title: format(t.bell.refused, { name: actor.name, what: what(e, locale) }), body: cut(reason, 280) }), { path: `/chest/expenses/${e.id}`, key: `refused:${e.id}` });
      }
    }
  }
  await settleWaiting(sql, decisions.map(d => d.owner));
  await refresh(sql, [actor.id, ...decisions.map(d => d.owner)]);
}

// The approvers' "X sent N expenses" goes when nothing of X waits any more.
export async function settleWaiting(sql: Query, owners: string[]): Promise<void> {
  for (const owner of new Set(owners)) {
    const [left] = await sql`select 1 from expenses where member_id = ${owner} and status = 'submitted' and deleted_at is null limit 1`;
    if (!left) await withdraw(`waiting:${owner}`);
  }
}

// The accountant marked expenses paid.
export async function paid(sql: Query, actor: Member, decisions: Decision[], paidOn: string): Promise<void> {
  for (const d of decisions) {
    if (d.owner === actor.id || d.owner === "erased") continue;
    const sum = totals(d.expenses);
    await notify([d.owner], (t, locale) => ({
      title: format(t.bell.paid, { total: totalText(sum, locale), date: formatDate(paidOn + "T12:00:00Z", locale, { day: "numeric", month: "long" }) }),
      body: cut(d.expenses.map(e => what(e, locale)).join("\n"), 280),
    }), { path: "/chest", key: `paid:${d.owner}` });
  }
  await refresh(sql, [actor.id]);
}

// A payment undone (the accountant's Undo, or a transfer file cancelled):
// the "Paid back" each person was told is taken back from their bell, so
// the Undo tells the truth.
export async function unpaid(sql: Query, owners: string[]): Promise<void> {
  for (const owner of new Set(owners)) if (owner !== "erased") await withdraw(`paid:${owner}`, [owner]);
  await refresh(sql, owners);
}

// refresh sets the tile's number of these members and of the accountants.
export async function refresh(sql: Query, people: string[]): Promise<void> {
  const accounting = await accountants();
  const ids = [...new Set([...people, ...accounting])].filter(p => p.startsWith("mbr_"));
  if (ids.length === 0) return;
  await badges(await waitingCounts(sql, ids, accounting));
}

// Bank details changed: a classic fraud is to change someone's account just
// before a payment. The person hears it when someone else did it; the
// accountants hear it when a person changed their own.
export async function bankChanged(actor: Member, owner: string, last4: string): Promise<void> {
  if (owner === "company") return;
  if (owner !== actor.id) {
    await notify([owner], t => ({ title: format(t.bell.bankByOther, { name: actor.name, last4 }) }), { path: "/chest/settings", key: `bank:${owner}` });
    return;
  }
  const recipients = (await accountants()).filter(a => a !== actor.id);
  await notify(recipients, t => ({ title: format(t.bell.bankOwn, { name: actor.name, last4 }) }), { path: "/chest/pay", key: `bank:${owner}` });
}

// Company card payments waiting for their receipt: each holder is asked in
// their bell ("3 card payments need their receipt"), one item per person,
// replaced at the next statement or reminder and withdrawn once every
// receipt is there (settleCardReceipts).
export async function cardReceipts(sql: Query, owners: string[]): Promise<number> {
  const owed = await receiptsOwed(sql, [...new Set(owners)]);
  const lines = await receiptLines(sql, [...owed.keys()]);
  for (const [owner, count] of owed) {
    await notify([owner], (t, locale) => ({ title: plural(t.bell.cardReceipts, count, locale), body: t.bell.cardReceiptsBody }), { path: "/chest", key: `card:${owner}` });
    // By email too, each payment named: "Receipt needed: UBER *TRIP · €23.40".
    const mine = lines.filter(l => l.owner === owner);
    await email([owner], (t, locale) => {
      const named = mine.map(l => `${shortDate(l.day, locale)} · ${l.merchant} · ${formatMoney(l.amount, l.currency, locale)}`);
      return {
        subject: mine.length === 1 ? format(t.mail.cardOne, { what: `${mine[0]!.merchant} · ${formatMoney(mine[0]!.amount, mine[0]!.currency, locale)}` }) : plural(t.bell.cardReceipts, count, locale),
        lines: [plural(t.mail.cardLine, count, locale), "", ...named, "", t.bell.cardReceiptsBody],
      };
    }, { path: "/chest", key: `card:${createHash("sha256").update(mine.map(l => l.id).join(",")).digest("hex").slice(0, 24)}` });
  }
  await refresh(sql, [...owed.keys()]);
  return owed.size;
}

export async function settleCardReceipts(sql: Query, owners: string[]): Promise<void> {
  const owed = await receiptsOwed(sql, owners);
  for (const owner of new Set(owners)) if (!owed.has(owner)) await withdraw(`card:${owner}`, [owner]);
}

// The card payments still waiting for their receipt, one line each.
async function receiptLines(sql: Query, owners: string[]): Promise<{ id: string; owner: string; day: string; merchant: string; amount: number; currency: string }[]> {
  if (owners.length === 0) return [];
  const rows = await sql<{ id: string; member_id: string; day: string; merchant: string; amount_cents: string; currency: string }[]>`
    select e.id, e.member_id, to_char(e.spent_on, 'YYYY-MM-DD') as day, e.merchant, e.amount_cents, e.currency
    from card_lines c join expenses e on e.id = c.expense_id
    where c.link = 'created' and e.status = 'draft' and e.deleted_at is null and e.receipt_object is null and e.member_id = any(${owners}::text[])
    order by e.spent_on, e.id limit 2000`;
  return rows.map(r => ({ id: String(r.id), owner: r.member_id, day: r.day, merchant: r.merchant, amount: Number(r.amount_cents), currency: r.currency }));
}
