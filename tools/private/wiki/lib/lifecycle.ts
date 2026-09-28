import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";

// What the wiki does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: the pages they were editing are free again
//   (their locks go) and their unsaved drafts go — nobody else can read a
//   draft, and they will not come back to it. What they wrote stays, signed
//   with their name ("former member"), their comments too. They stop
//   watching pages; the pages whose review reminders they owned keep their
//   reminders, which now go to whoever last saved each page.
// - Erasure: the same, and their id disappears from everything — authors
//   of pages, versions, files, spaces and comments read "Former member"
//   ('erased'). The pages stay for the team. Then the erasure is
//   acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from page_locks where member_id = ${memberId}`;
    await tx`delete from drafts where member_id = ${memberId}`;
    await tx`delete from page_watchers where member_id = ${memberId}`;
    await tx`update pages set review_owner = null where review_owner = ${memberId}`;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from page_locks where member_id = ${memberId}`;
    await tx`delete from drafts where member_id = ${memberId}`;
    await tx`delete from page_watchers where member_id = ${memberId}`;
    await tx`update pages set review_owner = null where review_owner = ${memberId}`;
    await tx`update page_comments set author = 'erased' where author = ${memberId}`;
    await tx`update pages set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update pages set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`update page_versions set author = 'erased' where author = ${memberId}`;
    await tx`update page_files set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update spaces set created_by = 'erased' where created_by = ${memberId}`;
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
