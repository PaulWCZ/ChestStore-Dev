import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { stopForLeaver } from "./timer.ts";

// What Timesheets does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: their running timer stops (it becomes an
//   entry when plausible, see stopForLeaver), they leave the projects they
//   were named on and their grid rows go. Their time stays: the company's
//   reports and invoices need it; names are resolved when rendering, so it
//   reads "Camille Martin (former member)".
// - Erasure: the same, then their time is kept for the company's accounts
//   but no longer theirs — its author becomes 'erased' ("Former member" in
//   the reports) and the notes they wrote are cleared; the period lock
//   forgets who set it. Then the erasure is acknowledged.
// Every step is idempotent: an event delivered again changes nothing more.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext(${"timesheets:" + memberId}))`;
    await stopForLeaver(tx, memberId);
    await tx`delete from project_people where member_id = ${memberId}`;
    await tx`delete from week_rows where member_id = ${memberId}`;
  });
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await leave(sql, memberId);
  await sql.begin(async tx => {
    await tx`delete from timers where member_id = ${memberId}`;
    await tx`update entries set member_id = 'erased', note = '', updated_at = now() where member_id = ${memberId}`;
    await tx`update settings set locked_by = 'erased' where locked_by = ${memberId}`;
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
