import * as events from "@argentic/chest-sdk/events";
import * as files from "@argentic/chest-sdk/files";
import type { Sql } from "./db.ts";
import { forgetGroups } from "./groups.ts";
import { reconcileReads } from "./tell.ts";

// What the wiki does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: the pages they were editing are free again
//   (their locks go) and their unsaved drafts go — nobody else can read a
//   draft, and they will not come back to it. What they wrote stays, signed
//   with their name ("former member"), their comments too. They stop
//   watching pages and are no longer named among a space's editors; the
//   pages whose review reminders they owned keep their
//   reminders, which now go to whoever last saved each page. Someone who
//   leaves the company (member.removed) also loses their "My pages" —
//   nobody else could ever read it; losing access keeps it for their return.
// - Erasure: the same (their "My pages" too), and their id disappears from everything — authors
//   of pages, versions, files, spaces and comments read "Former member"
//   ('erased'); their confirmations of reading go. The pages stay for the
//   team. Then the erasure is acknowledged. (Someone who only leaves keeps
//   their confirmations: they are the company's record.)
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`delete from page_locks where member_id = ${memberId}`;
    await tx`delete from drafts where member_id = ${memberId}`;
    await tx`delete from page_watchers where member_id = ${memberId}`;
    await tx`delete from space_editors where who = ${memberId}`;
    await tx`update pages set review_owner = null where review_owner = ${memberId}`;
  });
}

// dropPrivate deletes a member's own "My pages" (nobody else can read it)
// with its pages, history and files: when they leave the company or are
// erased. Losing access only keeps it, for when access comes back.
export async function dropPrivate(sql: Sql, memberId: string): Promise<void> {
  const objects = await sql.begin(async tx => {
    const found = await tx<{ object: string }[]>`
      select f.object from page_files f join pages p on p.id = f.page_id join spaces s on s.id = p.space_id
      where s.visibility = 'private' and s.created_by = ${memberId}`;
    await tx`delete from spaces where visibility = 'private' and created_by = ${memberId}`;
    return found.map(f => f.object);
  });
  for (const object of objects) await files.delete(object).catch(() => false);
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await dropPrivate(sql, memberId);
  await sql.begin(async tx => {
    await tx`delete from page_locks where member_id = ${memberId}`;
    await tx`delete from drafts where member_id = ${memberId}`;
    await tx`delete from page_watchers where member_id = ${memberId}`;
    await tx`delete from space_editors where who = ${memberId}`;
    await tx`update pages set review_owner = null where review_owner = ${memberId}`;
    await tx`update page_comments set author = 'erased' where author = ${memberId}`;
    await tx`update pages set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update pages set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`update page_versions set author = 'erased' where author = ${memberId}`;
    await tx`update page_files set added_by = 'erased' where added_by = ${memberId}`;
    await tx`update spaces set created_by = 'erased' where created_by = ${memberId}`;
    await tx`delete from page_reads where member_id = ${memberId}`;
    await tx`update pages set read_asked_by = 'erased' where read_asked_by = ${memberId}`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": event => leave(sql, event.data.id),
    "member.removed": async event => {
      await leave(sql, event.data.id);
      await dropPrivate(sql, event.data.id);
    },
    // Someone moved between groups: the pages to confirm that no longer
    // concern them leave their bell.
    "member.updated": async event => {
      if (!event.data.changed.includes("groups")) return;
      forgetGroups();
      await reconcileReads(sql, { member: event.data.id });
    },
    // Groups (Proposal (studio), "groups": "read"): read again; a group
    // changed or gone takes its pages to confirm from whoever left it.
    "group.changed": async event => {
      forgetGroups();
      if (event.data.changed.includes("members")) await reconcileReads(sql, { group: event.data.id });
    },
    "group.removed": async event => {
      forgetGroups();
      await reconcileReads(sql, { group: event.data.id });
    },
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
