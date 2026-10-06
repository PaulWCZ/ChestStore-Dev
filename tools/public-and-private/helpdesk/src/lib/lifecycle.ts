import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { forget } from "./rules.ts";

// When a member leaves or loses access, their open tickets go back to the
// shared inbox (nobody waits on someone who is gone). On erasure, their id
// disappears: what they wrote to customers stays, signed "Former member";
// what they asked through a team form stays, asked by "Former member".
// Rules that gave requests to them give them to nobody.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql`update tickets set assignee = null where assignee = ${memberId}`;
  await sql`delete from viewing where member_id = ${memberId}`;
  await sql`update rules set assignee = null where assignee = ${memberId}`;
  await sql`delete from rules where tag is null and priority is null and assignee is null`;
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update tickets set assignee = null where assignee = ${memberId}`;
    await tx`update ticket_events set assignee = null where assignee = ${memberId}`;
    // A colleague's requests (team forms) stay for the team, no longer theirs.
    await tx`update tickets set requester = 'erased' where requester = ${memberId}`;
    await tx`update messages set author = 'erased' where author = ${memberId}`;
    await tx`update saved_replies set created_by = 'erased' where created_by = ${memberId}`;
    await tx`delete from viewing where member_id = ${memberId}`;
    await tx`update saved_views set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update erasures set by_member = 'erased' where by_member = ${memberId}`;
    await forget(tx, memberId);
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

export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
