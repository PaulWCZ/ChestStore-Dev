import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { forgetGroups } from "./teams.ts";
import { tellAdminsOfOrphans } from "./tell.ts";

// What Goals does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: nothing is removed. Their objectives, key
//   results, check-ins and comments stay (the cycle's story needs them);
//   the owner reads "(former member)" and what they owned in cycles still
//   open waits for a new owner — the admins hear of it in the bell.
// - Erasure: their id is replaced by 'erased' everywhere (owner, author,
//   who wrote a retrospective, who changed a key result…); their email
//   choice, the reminders they got and the confidential objectives
//   opened to them are forgotten. Check-ins and comments stay, signed
//   "Former member". Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql`insert into departed (member_id) values (${memberId}) on conflict do nothing`;
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`update objectives set owner = 'erased' where owner = ${memberId}`;
    await tx`update objectives set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update objectives set retro_by = 'erased' where retro_by = ${memberId}`;
    await tx`update key_results set owner = 'erased' where owner = ${memberId}`;
    await tx`update key_results set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update check_ins set author = 'erased' where author = ${memberId}`;
    await tx`update comments set author = 'erased' where author = ${memberId}`;
    await tx`update cycles set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update cycles set closed_by = 'erased' where closed_by = ${memberId}`;
    await tx`update settings set updated_by = 'erased' where updated_by = ${memberId}`;
    await tx`update key_result_changes set author = 'erased' where author = ${memberId}`;
    await tx`update key_result_changes set before = 'erased' where field = 'owner' and before = ${memberId}`;
    await tx`update key_result_changes set after = 'erased' where field = 'owner' and after = ${memberId}`;
    await tx`delete from objective_viewers where member_id = ${memberId}`;
    await tx`delete from preferences where member_id = ${memberId}`;
    await tx`delete from nudges where member_id = ${memberId}`;
    await tx`update nudges set sent_by = 'erased' where sent_by = ${memberId}`;
    await tx`delete from departed where member_id = ${memberId}`;
    await tx`update fed_events set members = array_replace(members, ${memberId}, 'erased') where ${memberId} = any(members)`;
  });
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": async event => {
      await leave(sql, event.data.id);
      await tellAdminsOfOrphans(sql);
    },
    "member.removed": async event => {
      await leave(sql, event.data.id);
      await tellAdminsOfOrphans(sql);
    },
    // The Chest's groups changed (Proposal (studio): "groups": "read"):
    // their names and members are read again.
    "group.changed": async () => { forgetGroups(); },
    "group.removed": async () => { forgetGroups(); },
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await events.acknowledgeErasure(event.data.erasure);
      await tellAdminsOfOrphans(sql);
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
