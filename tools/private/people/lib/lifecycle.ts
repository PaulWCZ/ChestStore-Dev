import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { everyone, people } from "./people.ts";
import { forget } from "./journal.ts";
import { eraseRecords } from "./records.ts";
import { forgetChanges } from "./changes.ts";
import { left, todo } from "./tell.ts";
import { today } from "./zone.ts";

// What People does when a member changes, loses access, leaves or is erased
// (the Chest posts these to /chest-events, at least once).
//
// - A change of name or photo: nothing — the Chest gives them at render.
// - Losing access or leaving: they leave the directory (it lists the
//   Chest's members); their profile is kept 30 days in case they come back,
//   then purged. The people they managed keep them as manager, flagged
//   "manager has left": the org chart keeps its branch until HR names
//   someone else. The open to-dos given to them go to HR (whoever started
//   the checklist, when still HR; otherwise another HR), never to nobody.
//   Their checklist history stays, read "(former member)". Templates that
//   named them give the item to HR instead. The leaves Leave told of them
//   are forgotten. Their employee record stays: HR writes their last day.
// - Erasure: their profile is deleted, the checklists about them too, their
//   employee record keeps only what the staff register must show (or goes,
//   if they never started: lib/records.ts), and their id disappears from
//   everything else ('erased'). Then the erasure is acknowledged.
export type Left = { reports: string[]; open: number; given: { journeyId: string; assignee: string }[]; record: boolean };

export async function leave(sql: Sql, memberId: string, hr: string[] = []): Promise<Left> {
  const others = hr.filter(id => id !== memberId);
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    const reports = (await tx<{ member_id: string }[]>`update profiles set manager_left = true where manager_id = ${memberId} and left_at is null returning member_id`).map(r => r.member_id);
    await tx`update profiles set left_at = coalesce(left_at, now()) where member_id = ${memberId}`;
    const moved = await tx<{ journey_id: string; assignee: string | null }[]>`
      update journey_items i set assignee = case when j.created_by = any(${others}::text[]) then j.created_by else ${others[0] ?? null}::text end
      from journeys j where j.id = i.journey_id and i.assignee = ${memberId} and i.done_at is null and i.removed_at is null
      returning i.journey_id, i.assignee`;
    await tx`update template_items set role = 'hr', member_id = null where member_id = ${memberId}`;
    await tx`update arrivals set manager_id = null where manager_id = ${memberId}`;
    await tx`delete from away where member_id = ${memberId}`;
    const [record] = await tx`select 1 from records where member_id = ${memberId} and end_date is null`;
    const given = [...new Map(moved.filter(m => m.assignee).map(m => [`${m.journey_id}:${m.assignee}`, { journeyId: String(m.journey_id), assignee: m.assignee! }])).values()];
    return { reports: reports.sort(), open: moved.length, given, record: record !== undefined };
  });
}

export async function erase(sql: Sql, memberId: string, now: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext('people.managers'))`;
    await tx`delete from profiles where member_id = ${memberId}`;
    await tx`update profiles set manager_id = null, manager_left = false where manager_id = ${memberId}`;
    await tx`delete from field_values where member_id = ${memberId}`;
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
    await forgetChanges(tx, memberId);
    await eraseRecords(tx, memberId, now);
    await forget(tx, memberId);
  });
}

async function departed(sql: Sql, memberId: string): Promise<void> {
  const hr = (await everyone({ role: "hr" })).people.map(p => p.id).filter(id => id !== memberId);
  const change = await leave(sql, memberId, hr);
  for (const g of change.given) await todo(sql, null, { id: g.journeyId }, [g.assignee]);
  if (change.reports.length === 0 && change.open === 0 && !change.record) return;
  const who = (await people([memberId])).get(memberId);
  await left(hr, { id: memberId, name: who?.name ?? "" }, change);
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": event => departed(sql, event.data.id),
    "member.removed": event => departed(sql, event.data.id),
    "member.erased": async event => {
      await erase(sql, event.data.id, today());
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
