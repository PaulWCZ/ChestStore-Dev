import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { totals } from "./expenses.ts";
import { plural } from "../i18n/index.ts";
import { email } from "./mail.ts";
import { cut, notify } from "./notify.ts";
import { accountants } from "./people.ts";
import { cleanUploads, forget } from "./receipts.ts";
import { settings } from "./settings.ts";
import { totalText } from "./tell.ts";

// The tool's scheduled work (Proposal (studio): chest.proposals.json).

// "reminder", on the 25th: everyone with drafts not sent yet finds one item
// in their bell, in their language — "Send your expenses before the end of
// the month", with their count and total. It replaces last month's (same
// key); a run delivered twice sends the same item again, not a second one.
// Off when the accountant turned the reminder off. The same by email, and
// an email to each approver with expenses waiting for them ("5 expenses
// wait for you"): one per month (the key), whatever the retries.
export async function reminder(sql: Sql, run: Run): Promise<number> {
  if (!(await settings(sql)).reminder) return 0;
  const month = run.scheduledAt.slice(0, 7);
  const rows = await sql<{ member_id: string; amount_cents: string; currency: string }[]>`
    select member_id, amount_cents, currency from expenses
    where status = 'draft' and deleted_at is null and member_id <> 'erased' order by member_id limit 20000`;
  const byMember = new Map<string, { amount: number; currency: string }[]>();
  for (const r of rows) byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), { amount: Number(r.amount_cents), currency: r.currency }]);
  for (const [member, list] of byMember) {
    const sum = totals(list);
    await notify([member], (t, locale) => ({ title: t.bell.reminder, body: cut(plural(t.bell.reminderBody, list.length, locale, { total: totalText(sum, locale) }), 280) }), { path: "/chest", key: "reminder" });
    await email([member], (t, locale) => ({ subject: t.bell.reminder, lines: [plural(t.bell.reminderBody, list.length, locale, { total: totalText(sum, locale) }), "", t.mail.reminderLine] }), { path: "/chest", key: `reminder:${month}` });
  }
  // What waits for each approver: sent to them, or to the accountants
  // (never their own).
  const waiting = await sql<{ member_id: string; approver_id: string | null }[]>`
    select member_id, approver_id from expenses where status = 'submitted' and deleted_at is null limit 20000`;
  const team = waiting.some(w => w.approver_id === null) ? await accountants() : [];
  const counts = new Map<string, number>();
  for (const w of waiting) for (const who of w.approver_id ? [w.approver_id] : team.filter(a => a !== w.member_id)) counts.set(who, (counts.get(who) ?? 0) + 1);
  for (const [who, count] of counts) {
    await email([who], (t, locale) => ({ subject: plural(t.mail.waiting, count, locale), lines: [plural(t.mail.waiting, count, locale), "", t.mail.waitingLine] }), { path: "/chest/approve", key: `waiting:${month}` });
  }
  return byMember.size;
}

// "cleanup", every night: receipts uploaded but never put on an expense
// (after a day), and deleted drafts (after a week, the time of Undo), go
// with their files.
export async function cleanup(sql: Sql, _run?: Run): Promise<{ uploads: number; drafts: number }> {
  const uploads = await cleanUploads(sql);
  const gone = await sql<{ receipt_object: string | null }[]>`
    delete from expenses where deleted_at is not null and deleted_at < now() - interval '7 days' and status = 'draft' returning receipt_object`;
  await forget(gone.map(g => g.receipt_object).filter((o): o is string => o !== null));
  return { uploads, drafts: gone.length };
}
