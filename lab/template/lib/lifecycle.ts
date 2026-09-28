import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// What the tool does when a member changes, loses access, leaves or asks to
// be erased (the Chest posts these to /chest-events). Notes stay readable by
// the team when their author leaves: names are resolved when rendering, so a
// departed author reads "(former member)" by themselves. An erasure removes
// the person from the notes: their notes are deleted (they are theirs), then
// the erasure is acknowledged.
export function handlers(sql: Sql): events.Handlers {
  return {
    "member.erased": async event => {
      await sql`delete from notes where author = ${event.data.id}`;
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
