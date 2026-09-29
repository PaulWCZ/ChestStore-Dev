import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// What Polls does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once; every handler may run
// twice).
//
// - Losing access: nothing changes. They are no longer asked (the audience
//   is read from the Chest), their answers still count, their open polls
//   stay open; an admin can close them.
// - Leaving the Chest: the same, and their drafts are deleted (nobody else
//   can open a draft); their repeating surveys stop (the open round stays
//   open until its time). Their name reads "(former member)"; their
//   comments stay, under that name.
// - Erasure: their answers stay, counted but unnamed (participants.member
//   becomes 'erased'); the polls they organised stay, organised by 'erased'
//   ("Former member"), their repeating surveys stop, their comments stay
//   unnamed. Their drafts are deleted. An anonymous answer was
//   never tied to them; only the fact that they answered is unnamed. Then
//   the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql`delete from polls where organiser = ${memberId} and status = 'draft'`;
  await sql`update series set stopped_at = now() where organiser = ${memberId} and stopped_at is null`;
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from polls where organiser = ${memberId} and status = 'draft'`;
    await tx`update polls set organiser = 'erased' where organiser = ${memberId}`;
    await tx`update participants set member = 'erased' where member = ${memberId}`;
    await tx`update series set organiser = 'erased', stopped_at = coalesce(stopped_at, now()) where organiser = ${memberId}`;
    await tx`update comments set author = 'erased' where author = ${memberId}`;
    await tx`update polls set people = array_replace(people, ${memberId}, 'erased') where ${memberId} = any(people)`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
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
