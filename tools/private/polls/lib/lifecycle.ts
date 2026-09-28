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
//   can open a draft). Their name reads "(former member)".
// - Erasure: their answers stay, counted but unnamed (participants.member
//   becomes 'erased'); the polls they organised stay, organised by 'erased'
//   ("Former member"). Their drafts are deleted. An anonymous answer was
//   never tied to them; only the fact that they answered is unnamed. Then
//   the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql`delete from polls where organiser = ${memberId} and status = 'draft'`;
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from polls where organiser = ${memberId} and status = 'draft'`;
    await tx`update polls set organiser = 'erased' where organiser = ${memberId}`;
    await tx`update participants set member = 'erased' where member = ${memberId}`;
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
