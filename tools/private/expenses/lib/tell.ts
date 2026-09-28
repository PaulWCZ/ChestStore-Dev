import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { waitingCounts, totals, type Decision, type Expense, type Total } from "./expenses.ts";
import { format, formatDate, plural } from "./i18n/index.ts";
import { formatMoney } from "./money.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
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

// Someone sent expenses: their approver (or the accountants) hears of it.
export async function sent(sql: Query, actor: Member, result: { approver: string | null; expenses: Expense[] }): Promise<void> {
  const recipients = result.approver ? [result.approver] : (await accountants()).filter(a => a !== actor.id);
  const sum = totals(result.expenses);
  await notify(recipients, (t, locale) => ({
    title: plural(t.bell.sent, result.expenses.length, locale, { name: actor.name, total: totalText(sum, locale) }),
    body: cut(result.expenses.map(e => what(e, locale)).join("\n"), 280),
  }), { path: "/chest/approve", key: `waiting:${actor.id}` });
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

// refresh sets the tile's number of these members and of the accountants.
export async function refresh(sql: Query, people: string[]): Promise<void> {
  const accounting = await accountants();
  const ids = [...new Set([...people, ...accounting])].filter(p => p.startsWith("mbr_"));
  if (ids.length === 0) return;
  await badges(await waitingCounts(sql, ids, accounting));
}
