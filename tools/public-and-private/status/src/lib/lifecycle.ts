import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// What the tool does when a member loses access, leaves or asks to be
// erased (the Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: nothing to change. Their incidents and
//   updates stay (they were public); names are resolved when a page renders,
//   so a departed editor reads "(former member)" by themselves, and the
//   Chest already took their bell items and badge away.
// - Erasure: every mention of the person — author of an incident or an
//   update, who corrected or removed one — becomes 'erased'. The texts
//   stay: they were published to customers, and they are the company's
//   record of its incidents, not the person's data. Then the erasure is
//   acknowledged.
export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update incidents set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update incidents set removed_by = 'erased' where removed_by = ${memberId}`;
    await tx`update updates set author = 'erased' where author = ${memberId}`;
    await tx`update updates set removed_by = 'erased' where removed_by = ${memberId}`;
    await tx`update update_log set actor = 'erased' where actor = ${memberId}`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
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
