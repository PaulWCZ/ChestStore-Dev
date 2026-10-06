import type { Run } from "@argentic/chest-sdk/schedules";
import type { Sql } from "./db.ts";
import { decideCounts, totals } from "./expenses.ts";
import { plural } from "../i18n/index.ts";
import { cut, notify } from "./notify.ts";
import { accountants } from "./people.ts";
import { cleanUploads, forget } from "./receipts.ts";
import { settings } from "./settings.ts";
import { totalText } from "./tell.ts";

// The tool's scheduled work ("schedules" of chest.json, contract 0.4: run
// on POST /chest-schedules, src/app.tsx).

// "reminder", on the 25th: everyone with drafts not sent yet finds one item
// in their bell, in their language — "Send your expenses before the end of
// the month", with their count and total. It replaces last month's (same
// key); a run delivered twice sends the same item again, not a second one.
// Off when the accountant turned the reminder off. The same day, each
// approver with expenses waiting for them finds "5 expenses wait for your
// approval" — the nudge before the month closes for an approver who let
// the first notices go by (the Chest mails it to them when they chose so).
// It replaces last month's, and goes once nothing waits (tell.refresh).
export async function reminder(sql: Sql, _run?: Run): Promise<number> {
  if (!(await settings(sql)).reminder) return 0;
  const rows = await sql<{ member_id: string; amount_cents: string; currency: string }[]>`
    select member_id, amount_cents, currency from expenses
    where status = 'draft' and deleted_at is null and member_id <> 'erased' order by member_id limit 20000`;
  const byMember = new Map<string, { amount: number; currency: string }[]>();
  for (const r of rows) byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), { amount: Number(r.amount_cents), currency: r.currency }]);
  for (const [member, list] of byMember) {
    const sum = totals(list);
    await notify([member], (t, locale) => ({ title: t.bell.reminder, body: cut(plural(t.bell.reminderBody, list.length, locale, { total: totalText(sum, locale) }), 280) }), { path: "/chest", key: "reminder" });
  }
  // What waits for each approver: sent to them, or to the accountants
  // (never their own).
  const waiting = await sql<{ approver_id: string | null }[]>`
    select distinct approver_id from expenses where status = 'submitted' and deleted_at is null limit 20000`;
  const team = await accountants();
  const approvers = [...new Set([...waiting.flatMap(w => w.approver_id ? [w.approver_id] : team)])].filter(id => id.startsWith("mbr_"));
  for (const [who, count] of await decideCounts(sql, approvers, team)) {
    if (count === 0) continue;
    await notify([who], (t, locale) => ({ title: plural(t.bell.waiting, count, locale), body: t.bell.waitingBody }), { path: "/chest/approve", key: "approve-reminder" });
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
