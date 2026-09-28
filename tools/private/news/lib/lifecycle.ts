import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { today } from "./time.ts";
import { chestZone } from "./zone.ts";

// What News does when a member loses access, leaves or is erased (the Chest
// posts these to /chest-events, at least once; every handler may run twice).
//
// - Losing access or leaving: their answers to events still to come are
//   removed (nobody counts on them), their last visit and weekly digest are
//   forgotten. What they wrote and confirmed stays: it is the company's
//   record, and their name reads "(former member)".
// - Erasure: what they wrote stays for the company, unsigned ('erased'):
//   posts, comments, reactions (still counted), files they added; a welcome
//   post about them names nobody. Their confirmations, answers and visit
//   are deleted (and their digest's record). Then the erasure is
//   acknowledged. The words others wrote about them (a welcome text, a
//   photo) are not changed: a publisher deletes the post if it must go
//   (README, "On a Chest").
export async function leave(sql: Sql, memberId: string, day = today(chestZone())): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from rsvps r using posts p where p.id = r.post_id and r.member = ${memberId} and p.event_day >= ${day}`;
    await tx`delete from visits where member = ${memberId}`;
    await tx`delete from digests where member = ${memberId}`;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update posts set author = 'erased' where author = ${memberId}`;
    await tx`update posts set welcome = 'erased' where welcome = ${memberId}`;
    await tx`update comments set author = 'erased' where author = ${memberId}`;
    await tx`update reactions set member = 'erased' where member = ${memberId}`;
    await tx`update files set added_by = 'erased' where added_by = ${memberId}`;
    await tx`delete from confirmations where member = ${memberId}`;
    await tx`delete from rsvps where member = ${memberId}`;
    await tx`delete from visits where member = ${memberId}`;
    await tx`delete from digests where member = ${memberId}`;
  });
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
