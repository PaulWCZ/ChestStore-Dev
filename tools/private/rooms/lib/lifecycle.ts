import * as events from "@argentic/chest-sdk/events";
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
//   what they said about coming days goes. The past stays, for the export.
// - Erasure: the same, then every trace of their id goes: past bookings
//   read "Former member" ('erased'), their presence and preferences are
//   deleted. Then the erasure is acknowledged.
export async function leave(sql: Sql, memberId: string, tz = zone()): Promise<RoomBooking[]> {
  const rooms = await sql.begin(async tx => {
    const gone = await cancelRoomBookings(tx, "chest", tz, tx`member_id = ${memberId} and upper(during) > now()`);
    await cancelDeskBookings(tx, "chest", tx`b.member_id = ${memberId} and upper(b.during) > now()`);
    await tx`delete from room_attendees a using room_bookings b where b.id = a.booking_id and a.member_id = ${memberId} and upper(b.during) > now()`;
    await tx`update desks set assigned_to = null where assigned_to = ${memberId}`;
    await tx`delete from presence where member_id = ${memberId} and day >= (now() at time zone ${tz})::date`;
    return gone;
  });
  await cancelled(null, rooms, "left");
  return rooms;
}

export async function erase(sql: Sql, memberId: string, tz = zone()): Promise<void> {
  await leave(sql, memberId, tz);
  await sql.begin(async tx => {
    await tx`update desk_bookings set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update room_bookings set member_id = 'erased' where member_id = ${memberId}`;
    await tx`update desk_bookings set cancelled_by = 'erased' where cancelled_by = ${memberId}`;
    await tx`update room_bookings set cancelled_by = 'erased' where cancelled_by = ${memberId}`;
    await tx`delete from room_attendees where member_id = ${memberId}`;
    await tx`delete from presence where member_id = ${memberId}`;
    await tx`delete from member_prefs where member_id = ${memberId}`;
  });
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
