import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { forget } from "./receipts.ts";
import { refresh, settleWaiting } from "./tell.ts";

// What Expenses does when a member loses access, leaves, or is erased (the
// Chest posts these to /chest-events, at least once; every step is
// idempotent).
//
// - Losing access or leaving: their expenses stay as they are — what they
//   sent still waits, and the accountant sees it under "Name (former
//   member)" to approve and pay it. The people they approved fall back to
//   the accountants, and so do the expenses waiting for them.
// - Erasure: the company must keep its accounting records (receipts and
//   amounts of what was sent, approved or paid: 10 years, French commercial
//   code). Those stay, but the person's id is replaced by 'erased'
//   everywhere and their notes are deleted. Their drafts — never sent, not
//   records of anything — are deleted with their receipts, and so are their
//   vehicle and unused uploads. Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  const owners = await sql.begin(async tx => {
    await tx`delete from approvers where approver_id = ${memberId}`;
    const moved = await tx<{ id: string; member_id: string }[]>`
      update expenses set approver_id = null where approver_id = ${memberId} and status = 'submitted' returning id, member_id`;
    for (const m of moved) await tx`insert into history (expense_id, actor, kind) values (${m.id}, 'chest', 'reassigned')`;
    return moved.map(m => m.member_id);
  });
  await settleWaiting(sql, owners);
  await refresh(sql, owners);
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  const objects = await sql.begin(async tx => {
    await tx`delete from approvers where approver_id = ${memberId} or member_id = ${memberId}`;
    await tx`update expenses set approver_id = null where approver_id = ${memberId} and status = 'submitted'`;
    const drafts = await tx<{ receipt_object: string | null }[]>`
      delete from expenses where member_id = ${memberId} and (status = 'draft' or deleted_at is not null) returning receipt_object`;
    await tx`update expenses set member_id = 'erased', note = '' where member_id = ${memberId}`;
    await tx`update expenses set approver_id = 'erased' where approver_id = ${memberId}`;
    await tx`update expenses set decided_by = 'erased' where decided_by = ${memberId}`;
    await tx`update expenses set paid_marked_by = 'erased' where paid_marked_by = ${memberId}`;
    await tx`update claims set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update history set actor = 'erased' where actor = ${memberId}`;
    await tx`update mileage_scales set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`delete from vehicles where member_id = ${memberId}`;
    const uploads = await tx<{ object: string }[]>`delete from uploads where member_id = ${memberId} returning object`;
    return [...drafts.map(d => d.receipt_object).filter((o): o is string => o !== null), ...uploads.map(u => u.object)];
  });
  await forget(objects);
  await refresh(sql, []);
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": event => leave(sql, event.data.id),
    "member.removed": event => leave(sql, event.data.id),
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database: a delivery
// made again after a restart is recognised.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
