import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { sync } from "./due-calendar.ts";
import { forgetGroups } from "./groups.ts";

// What Tasks does when a member changes, loses access, leaves or is erased
// (the Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: their open cards and steps are unassigned
//   (the history says so), so nothing waits on someone who is gone; they leave the
//   boards' people, and their reminder setting goes. Done and archived
//   cards keep who did them.
// - Erasure: their id disappears from everything — assignments, boards'
//   people, the history's mentions of them — and what they wrote stays for
//   the team, signed "Former member" ('erased'). Then the erasure is
//   acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    const open = await tx<{ card_id: string }[]>`
      select a.card_id from card_assignees a join cards c on c.id = a.card_id join columns k on k.id = c.column_id
      where a.member_id = ${memberId} and c.archived_at is null and not k.done`;
    for (const { card_id } of open) {
      await tx`delete from card_assignees where card_id = ${card_id} and member_id = ${memberId}`;
      await tx`insert into activity (card_id, actor, kind, data) values (${card_id}, 'chest', 'unassigned_left', ${tx.json({ member: memberId })})`;
    }
    // Their open steps are freed too; ticked ones keep who did them.
    await tx`update checklist_items set assignee = null where assignee = ${memberId} and not done`;
    await tx`delete from board_people where member_id = ${memberId}`;
    await tx`delete from reminders where member_id = ${memberId}`;
    // Emails waiting for them, and what their bell showed, go.
    await tx`delete from mail_queue where member_id = ${memberId}`;
    await tx`delete from comment_notices where member_id = ${memberId}`;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from card_assignees where member_id = ${memberId}`;
    await tx`update checklist_items set assignee = null where assignee = ${memberId}`;
    await tx`delete from board_people where member_id = ${memberId}`;
    await tx`delete from reminders where member_id = ${memberId}`;
    await tx`delete from mail_queue where member_id = ${memberId}`;
    await tx`delete from comment_notices where member_id = ${memberId}`;
    // What they did to others, still waiting to be emailed, leaves unsigned: it goes.
    await tx`delete from mail_queue where actor = ${memberId}`;
    await tx`update card_blockers set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update boards set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update cards set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update comments set author = 'erased' where author = ${memberId}`;
    await tx`update attachments set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update activity set actor = 'erased' where actor = ${memberId}`;
    await tx`update activity set data = data - 'member' where data->>'member' = ${memberId}`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
    // Someone moved between groups, or a group changed (Proposal (studio),
    // "groups": "read"): who sees a private board shared with a group is
    // asked again.
    "member.updated": async event => { if (event.data.changed.includes("groups")) forgetGroups(); },
    "group.changed": async () => { forgetGroups(); },
    "group.removed": async () => { forgetGroups(); },
    // Their cards and steps change hands: the calendars follow.
    "access.revoked": async event => { await leave(sql, event.data.id); await sync(sql); },
    "member.removed": async event => { await leave(sql, event.data.id); await sync(sql); },
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await sync(sql);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}

// The ids kept 30 days (the Chest retries a delivery for far less): the
// morning run forgets older ones, so the table does not grow with every
// schedule run.
export async function forgetSeen(sql: Sql): Promise<number> {
  return (await sql`delete from chest_events where handled_at < now() - interval '30 days'`).count;
}
