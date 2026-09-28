import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { everyone, people } from "./people.ts";
import { left } from "./tell.ts";

// What People does when a member changes, loses access, leaves or is erased
// (the Chest posts these to /chest-events, at least once).
//
// - A change of name or photo: nothing — the Chest gives them at render.
// - Losing access or leaving: they leave the directory (it lists the
//   Chest's members); their profile is kept 30 days in case they come back,
//   then purged. The people they managed no longer have a manager, and the
//   open to-dos given to them go back to "nobody yet"; HR is told. Their
//   checklist history stays, read "(former member)". Templates that named
//   them give the item to HR instead. The leaves Leave told of them are
//   forgotten.
// - Erasure: their profile is deleted, the checklists about them too (their
//   HR record), and their id disappears from everything else ('erased').
//   Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<{ reports: string[]; open: number }> {
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    const reports = (await tx<{ member_id: string }[]>`update profiles set manager_id = null where manager_id = ${memberId} returning member_id`).map(r => r.member_id);
    await tx`update profiles set left_at = coalesce(left_at, now()) where member_id = ${memberId}`;
    const open = await tx`update journey_items set assignee = null where assignee = ${memberId} and done_at is null and removed_at is null returning id`;
    await tx`update template_items set role = 'hr', member_id = null where member_id = ${memberId}`;
    await tx`update arrivals set manager_id = null where manager_id = ${memberId}`;
    await tx`delete from away where member_id = ${memberId}`;
    return { reports: reports.sort(), open: open.length };
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    await tx`delete from profiles where member_id = ${memberId}`;
    await tx`update profiles set manager_id = null where manager_id = ${memberId}`;
    await tx`delete from journeys where person_id = ${memberId}`;
    await tx`update journeys set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update journey_items set assignee = 'erased' where assignee = ${memberId}`;
    await tx`update journey_items set done_by = 'erased' where done_by = ${memberId}`;
    await tx`update template_items set role = 'hr', member_id = null where member_id = ${memberId}`;
    await tx`update templates set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update arrivals set manager_id = null where manager_id = ${memberId}`;
    await tx`update arrivals set hired_by = null where hired_by = ${memberId}`;
    await tx`update arrivals set member_id = 'erased' where member_id = ${memberId}`;
    await tx`delete from away where member_id = ${memberId}`;
  });
}

async function departed(sql: Sql, memberId: string): Promise<void> {
  const change = await leave(sql, memberId);
  if (change.reports.length === 0 && change.open === 0) return;
  const hr = (await everyone({ role: "hr" })).people.map(p => p.id).filter(id => id !== memberId);
  const who = (await people([memberId])).get(memberId);
  await left(hr, { id: memberId, name: who?.name ?? "" }, change.reports, change.open);
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
