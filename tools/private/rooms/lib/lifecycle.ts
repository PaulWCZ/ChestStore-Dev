import * as calendar from "@argentic/chest-sdk/calendar";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { dayKey, enqueue, flush, keepDays, roomKey } from "./calendar.ts";
import type { Sql } from "./db.ts";
import { cancelDeskBookings } from "./places.ts";
import { cancelRoomBookings, type RoomBooking } from "./room-bookings.ts";
import { cancelled } from "./tell.ts";
import { zone } from "./zone.ts";

// What Rooms does when a member loses access, leaves or is erased (the
// Chest posts these to /chest-events, at least once).
//
// - Losing access or leaving: their coming bookings are cancelled — the
//   rooms are free again and the people they invited are told —, they leave
//   the meetings they were invited to, the desk given to them is free, and
//   what they said about coming days goes, and so do the visitors coming
//   to see them. The past stays, for the export.
// - Erasure: the same, then every trace of their id goes: past bookings
//   read "Former member" ('erased'), their presence and preferences are
//   deleted. Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string, tz = zone()): Promise<RoomBooking[]> {
  const rooms = await sql.begin(async tx => {
    const gone = await cancelRoomBookings(tx, "chest", tz, tx`member_id = ${memberId} and upper(during) > now()`);
    await cancelDeskBookings(tx, "chest", tx`b.member_id = ${memberId} and upper(b.during) > now()`);
    const left = await tx<{ id: string }[]>`
      delete from room_attendees a using room_bookings b where b.id = a.booking_id and a.member_id = ${memberId} and upper(b.during) > now() returning b.id`;
    await enqueue(tx, left.map(r => roomKey(String(r.id))));
    await tx`update desks set assigned_to = null where assigned_to = ${memberId}`;
    const days = await tx<{ day: string }[]>`
      delete from presence where member_id = ${memberId} and day >= (now() at time zone ${tz})::date returning to_char(day, 'YYYY-MM-DD') as day`;
    await enqueue(tx, days.map(r => dayKey(memberId, r.day)));
    await tx`delete from usual_week where member_id = ${memberId}`;
    await tx`delete from usual_applied where member_id = ${memberId}`;
    await tx`update member_prefs set usual_desk = null where member_id = ${memberId}`;
    // Their coming visitors: nobody is there to see them.
    await tx`update visits set cancelled_at = now() where host = ${memberId} and day >= (now() at time zone ${tz})::date and cancelled_at is null`;
    return gone;
  });
  await cancelled(null, rooms, "left");
  await flush(sql, tz);
  return rooms;
}

export async function erase(sql: Sql, memberId: string, tz = zone()): Promise<void> {
  await leave(sql, memberId, tz);
  await sql.begin(async tx => {
    await tx`update desk_bookings set member_id = 'erased' where member_id = ${memberId}`;
    const organised = await tx<{ id: string; recent: boolean }[]>`
      update room_bookings set member_id = 'erased' where member_id = ${memberId} returning id, (day >= (now() at time zone ${tz})::date - ${keepDays}::int) as recent`;
    await tx`update desk_bookings set cancelled_by = 'erased' where cancelled_by = ${memberId}`;
    await tx`update room_bookings set cancelled_by = 'erased' where cancelled_by = ${memberId}`;
    const attended = await tx<{ booking_id: string }[]>`delete from room_attendees where member_id = ${memberId} returning booking_id`;
    await enqueue(tx, attended.map(r => roomKey(String(r.booking_id))));
    await tx`delete from presence where member_id = ${memberId}`;
    await tx`delete from leave_words where member_id = ${memberId}`;
    await tx`delete from member_prefs where member_id = ${memberId}`;
    await tx`update visits set host = 'erased' where host = ${memberId}`;
    await tx`update visits set created_by = 'erased' where created_by = ${memberId}`;
    await tx`update visits set arrived_by = 'erased' where arrived_by = ${memberId}`;
    // Their past room bookings stay in their guests' calendars, without
    // them; their own days leave the calendars (the Chest drops the feed of
    // an erased person anyway), and their id leaves the tool's queue.
    await enqueue(tx, organised.filter(r => r.recent).map(r => roomKey(String(r.id))));
  });
  const theirs = await sql<{ key: string }[]>`
    select key from calendar_sent where key like ${"day:" + memberId + ":%"} union select key from calendar_queue where key like ${"day:" + memberId + ":%"}`;
  for (const { key } of theirs) {
    try {
      await calendar.remove(key);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
  await sql`delete from calendar_sent where key like ${"day:" + memberId + ":%"}`;
  await sql`delete from calendar_queue where key like ${"day:" + memberId + ":%"}`;
  await flush(sql, tz);
}

export function handlers(sql: Sql): events.Handlers {
  return {
    "access.revoked": async event => { await leave(sql, event.data.id); },
    "member.removed": async event => { await leave(sql, event.data.id); },
    "member.erased": async event => {
      await erase(sql, event.data.id);
      await events.acknowledgeErasure(event.data.erasure);
    },
  };
}

// The ids of the events already handled, kept in the database.
export function seen(sql: Sql): events.Seen {
  return {
    has: async id => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
    add: async id => {
      await sql`insert into chest_events (id) values (${id}) on conflict do nothing`;
    },
  };
}
