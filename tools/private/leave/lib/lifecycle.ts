import * as events from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { today } from "./model.ts";
import { withdraw } from "./notify.ts";
import { settleAfterLastDay } from "./last-day.ts";
import { afterLastDay, refreshBadges } from "./tell.ts";
import { fromLeaving, fromRecord } from "./from-people.ts";
import { forget } from "./busy.ts";
import { forgetMember, keepInLine } from "./share.ts";

// What Leave does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once; each handler may run
// again safely).
//
// - Losing access or leaving: their requests still waiting are cancelled
//   (the history says why), the people they approved go back to HR, and
//   their last day is set (today, unless HR already set one): nothing is
//   earned after it. Approved leave up to that day and balances stay: they
//   are HR's records, and the balance on the last day is what payroll
//   pays; approved leave after it is cancelled or cut at it, its days come
//   back, and HR is told (lib/last-day.ts).
// - Erasure: the same, then their id, notes and reasons disappear from the
//   requests, their history and the balance lines, which keep their dates,
//   kinds and days, signed 'erased' — the absences and balances HR may have
//   to keep for payroll (see README). Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string): Promise<void> {
  const { cancelled, settled } = await sql.begin(async tx => {
    const rows = await tx<{ id: string }[]>`update requests set status = 'cancelled' where member_id = ${memberId} and status = 'pending' returning id`;
    for (const r of rows) await tx`insert into request_events (request_id, actor, kind) values (${r.id}, 'chest', 'left')`;
    await tx`update staff set approver_id = null, updated_at = now() where approver_id = ${memberId}`;
    const [row] = await tx<{ end_date: string }[]>`
      insert into staff (member_id, end_date, end_by) values (${memberId}, ${today()}, 'chest')
      on conflict (member_id) do update set end_date = coalesce(staff.end_date, excluded.end_date),
        end_by = case when staff.end_date is null then 'chest' else staff.end_by end, updated_at = now()
      returning to_char(end_date, 'YYYY-MM-DD') as end_date`;
    // Approved leave after the last day no longer counts (lib/last-day.ts).
    const settled = await settleAfterLastDay(tx, memberId, row!.end_date, "chest");
    return { cancelled: rows.map(r => String(r.id)), settled };
  });
  for (const id of [...cancelled, ...settled.cancelled]) await withdraw(`req:${id}`);
  if (settled.cancelled.length + settled.cut.length > 0) await afterLastDay(memberId, settled);
  await refreshBadges(sql);
}

export async function erase(sql: Sql, memberId: string): Promise<void> {
  await leave(sql, memberId);
  await sql.begin(async tx => {
    const mine = await tx<{ id: string }[]>`update requests set member_id = 'erased', note = null, reason = null, cancel_asked_at = null where member_id = ${memberId} returning id`;
    const ids = mine.map(r => String(r.id));
    if (ids.length > 0) await tx`update request_events set reason = null where request_id in ${tx(ids)}`;
    await tx`update requests set decided_by = 'erased' where decided_by = ${memberId}`;
    await tx`update request_events set actor = 'erased' where actor = ${memberId}`;
    await tx`update ledger set member_id = 'erased', reason = null where member_id = ${memberId}`;
    await tx`update ledger set created_by = 'erased' where created_by = ${memberId}`;
    await tx`delete from staff where member_id = ${memberId}`;
    await tx`update settings set updated_by = null where updated_by = ${memberId}`;
    await forget(tx, memberId);
    await forgetMember(tx, memberId);
  });
}

// What other tools tell Leave (events between tools): People's records and
// departures (lib/from-people.ts).
// After each, the calendar feeds and the busy times follow (leave cut or
// cancelled by a last day, erased).
export function tools(sql: Sql): events.ToolHandlers {
  return {
    "people.record": async e => { await fromRecord(sql, e.data, new Date(e.occurredAt)); await keepInLine(sql); },
    "people.leaving": async e => { await fromLeaving(sql, e.data, new Date(e.occurredAt), false); await keepInLine(sql); },
    "people.leaving_cancelled": async e => { await fromLeaving(sql, e.data, new Date(e.occurredAt), true); await keepInLine(sql); },
  };
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": async event => { await leave(sql, event.data.id); await keepInLine(sql); },
    "member.removed": async event => { await leave(sql, event.data.id); await keepInLine(sql); },
    // A role changed: the approvers' tiles may count differently.
    "member.updated": async event => {
      if (event.data.changed.includes("role")) await refreshBadges(sql);
    },
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await keepInLine(sql);
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
