import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { forgetInRuns } from "./payments.ts";
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
//   vehicle, bank details (also in past transfer files) and unused uploads.
//   Then the erasure is acknowledged.
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
    await tx`update expenses set guest_members = array_replace(guest_members, ${memberId}, 'erased') where ${memberId} = any(guest_members)`;
    await tx`update expenses set decided_by = 'erased' where decided_by = ${memberId}`;
    await tx`update expenses set paid_marked_by = 'erased' where paid_marked_by = ${memberId}`;
    await tx`update claims set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update history set actor = 'erased' where actor = ${memberId}`;
    await tx`update mileage_scales set updated_by = 'erased' where updated_by = ${memberId}`;
    const proofs = await tx<{ proof_object: string | null }[]>`delete from vehicles where member_id = ${memberId} returning proof_object`;
    await tx`update vehicles set checked_by = 'erased' where checked_by = ${memberId}`;
    await tx`delete from prior_distances where member_id = ${memberId}`;
    await tx`delete from member_accounts where member_id = ${memberId}`;
    await tx`delete from bank_accounts where owner = ${memberId}`;
    await tx`update bank_accounts set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`update payment_runs set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update payment_runs set cancelled_by = 'erased' where cancelled_by = ${memberId}`;
    await tx`update rates set updated_by = 'erased' where updated_by = ${memberId}`;
    // Card payments are the company's bank records: kept, without the person.
    await tx`update card_lines set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update card_lines set checked_by = 'erased' where checked_by = ${memberId}`;
    await tx`update card_statements set created_by = 'erased' where created_by = ${memberId}`;
    await forgetInRuns(tx, memberId);
    const uploads = await tx<{ object: string }[]>`delete from uploads where member_id = ${memberId} returning object`;
    return [...[...drafts.map(d => d.receipt_object), ...proofs.map(p => p.proof_object)].filter((o): o is string => o !== null), ...uploads.map(u => u.object)];
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
