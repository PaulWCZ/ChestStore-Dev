import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { people } from "./people.ts";
import { left } from "./tell.ts";
import { withdraw } from "./notify.ts";

// What Equipment does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: nothing is given back by itself — the laptop
//   is still in their bag until someone takes it back. Each item they hold
//   notes it in its history, and the managers are told "Léa left and holds
//   3 items", with a link to her page and its "Take everything back". Their
//   name then reads "(former member)" wherever they appear.
// - Erasure: their id disappears from everything ('erased'). What they held
//   stays held by "Former member" until a manager takes it back: the company
//   still has to get it back. Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<number> {
  return sql.begin(async tx => {
    const held = await tx<{ id: string }[]>`
      select id from items where holder = ${memberId} and deleted_at is null
      union select s.item_id from seats s join items i on i.id = s.item_id where s.member_id = ${memberId} and i.deleted_at is null`;
    for (const { id } of held) {
      // Once per item, even if the event comes again.
      const [last] = await tx<{ kind: string; member: string | null }[]>`select kind, member from history where item_id = ${id} order by id desc limit 1`;
      if (last?.kind === "left" && last.member === memberId) continue;
      await tx`insert into history (item_id, actor, kind, member) values (${id}, 'chest', 'left', ${memberId})`;
    }
    return held.length;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update items set holder = 'erased' where holder = ${memberId}`;
    await tx`update items set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update seats set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update problems set reported_by = 'erased' where reported_by = ${memberId}`;
    await tx`update problems set solved_by = 'erased' where solved_by = ${memberId}`;
    await tx`update history set actor = 'erased' where actor = ${memberId}`;
    await tx`update history set member = 'erased' where member = ${memberId}`;
  });
  await withdraw(`left:${memberId}`);
}

async function departed(sql: Sql, memberId: string): Promise<void> {
  const count = await leave(sql, memberId);
  if (count === 0) return;
  const who = (await people([memberId])).get(memberId);
  await left({ id: memberId, name: who && (who.status === "member" || who.status === "former") ? who.name : "" }, count);
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": event => departed(sql, event.data.id),
    "member.removed": event => departed(sql, event.data.id),
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
