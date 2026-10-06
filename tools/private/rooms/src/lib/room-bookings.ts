import type { Member } from "@argentic/chest-sdk/member";
import { can, mayChange } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { checkWhen, conflict, moment, span } from "./booking-rules.ts";
import { enqueue, roomKey } from "./calendar.ts";
import { bookedFor } from "./desk-bookings.ts";
import { groupsOf } from "./groups.ts";
import type { Fragment, Query, Sql } from "./db.ts";
import { addDays, clean, day, id, int, limits, memberIds, minutes } from "../shared/model.ts";

// Meeting rooms booked by the quarter hour. PostgreSQL refuses two live
// bookings of a room that overlap (constraint room_taken): whoever comes
// second is told "taken", however close together they clicked. A weekly
// booking is its occurrences, each a booking of its own (cancelled one by
// one), sharing a series number.

export type RoomBooking = {
  id: string;
  roomId: string;
  roomName: string;
  memberId: string;
  title: string;
  day: string;
  start: number;
  end: number;
  series: string | null;
  attendees: string[];
  revision: number;
  checkedIn: boolean;
};

type Row = { id: string; room_id: string; room_name: string; member_id: string; title: string; day: string; start: number; end: number; series: string | null; attendees: string[]; revision: number; checked_in: boolean };
const toBooking = (r: Row): RoomBooking => ({
  id: String(r.id), roomId: String(r.room_id), roomName: r.room_name, memberId: r.member_id, title: r.title, day: r.day,
  start: Number(r.start), end: Number(r.end), series: r.series === null ? null : String(r.series), attendees: r.attendees ?? [], revision: Number(r.revision ?? 0), checkedIn: r.checked_in === true,
});

// The columns every answer carries: local day and minutes in the Chest's zone.
function columns(sql: Query, zone: string) {
  return sql`b.id, b.room_id, r.name as room_name, b.member_id, b.title, to_char(b.day, 'YYYY-MM-DD') as day,
    (extract(epoch from (lower(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as start,
    (extract(epoch from (upper(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as "end",
    b.series, b.revision, b.checked_in_at is not null as checked_in,
    coalesce((select array_agg(a.member_id order by a.member_id) from room_attendees a where a.booking_id = b.id), '{}') as attendees`;
}

export async function byIds(sql: Query, ids: readonly string[], zone: string): Promise<RoomBooking[]> {
  if (ids.length === 0) return [];
  const rows = await sql<Row[]>`select ${columns(sql, zone)} from room_bookings b join rooms r on r.id = b.room_id where b.id = any(${ids}::bigint[]) order by b.day, lower(b.during)`;
  return rows.map(toBooking);
}

// Cancels the live bookings a condition names (unqualified columns of
// room_bookings); says which, to tell their people.
export async function cancelRoomBookings(tx: Query, by: string, zone: string, where: Fragment): Promise<RoomBooking[]> {
  const ids = (await tx<{ id: string }[]>`update room_bookings set cancelled_at = now(), cancelled_by = ${by}, revision = revision + 1, changed_at = now() where cancelled_at is null and ${where} returning id`).map(r => String(r.id));
  await enqueue(tx, ids.map(roomKey));
  return byIds(tx, ids, zone);
}

type Slot = { start: number; end: number };
function slot(m: Awaited<ReturnType<typeof moment>>, startValue: unknown, endValue: unknown): Slot {
  const start = minutes(startValue);
  const end = minutes(endValue);
  if (end <= start || start < m.rules.dayStart || end > m.rules.dayEnd) throw new AppError("outside_hours");
  return { start, end };
}

// A room one may book: still there, and — when it is kept for a group —
// the one it is for is in that group (groups: every group they are in,
// groupsOf), or the actor is an admin.
async function liveRoom(sql: Query, roomId: string, groups: readonly string[], exempt: boolean): Promise<{ id: string; name: string }> {
  const [room] = await sql<{ id: string; name: string; group_id: string | null }[]>`select id, name, group_id from rooms where id = ${roomId} and archived_at is null`;
  if (!room) throw new AppError("not_found");
  if (room.group_id !== null && !exempt && !groups.includes(room.group_id)) throw new AppError("group_only");
  return { id: String(room.id), name: room.name };
}

export type RoomInput = { roomId?: unknown; day?: unknown; start?: unknown; end?: unknown; title?: unknown; attendees?: unknown; weeks?: unknown; for?: unknown };

// Books a room; with weeks > 1, the same slot every week. Occurrences
// someone else holds are skipped and named (taken); if none is free, the
// booking is refused. An admin may book for someone else (for): they are
// its organiser, and the caller tells them.
export async function bookRoom(sql: Sql, actor: Member | null, input: RoomInput, zone: string): Promise<{ bookings: RoomBooking[]; taken: string[] }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const roomId = id(input.roomId);
  const first = day(input.day);
  const title = clean(input.title, limits.title, { optional: true });
  const who = await bookedFor(actor, input.for);
  const attendees = memberIds(input.attendees, limits.attendees).filter(a => a !== who.id);
  return sql.begin(async tx => {
    const m = await moment(tx, actor, zone);
    const s = slot(m, input.start, input.end);
    const weeks = input.weeks === undefined ? 1 : int(input.weeks, 1, m.exempt ? 52 : m.rules.repeatWeeks);
    checkWhen(m, first, s, "room");
    await liveRoom(tx, roomId, who.groups, m.exempt);
    const series = weeks > 1 ? String((await tx<{ n: string }[]>`select nextval('room_series') as n`)[0]!.n) : null;
    const ids: string[] = [];
    const taken: string[] = [];
    for (let w = 0; w < weeks; w++) {
      const d = addDays(first, 7 * w);
      try {
        const row = await tx.savepoint(async sp => {
          const [r] = await sp<{ id: string }[]>`
            insert into room_bookings (room_id, member_id, title, day, during, series)
            values (${roomId}, ${who.id}, ${title}, ${d}, ${span(sp, d, s.start, s.end, zone)}, ${series})
            returning id`;
          return r!;
        });
        ids.push(String(row.id));
      } catch (error) {
        const refused = conflict(error);
        if (!refused) throw error;
        if (weeks === 1) throw refused;
        taken.push(d);
      }
    }
    if (ids.length === 0) throw new AppError("taken");
    for (const bid of ids) for (const a of attendees) await tx`insert into room_attendees (booking_id, member_id) values (${bid}, ${a}) on conflict do nothing`;
    await enqueue(tx, ids.map(roomKey));
    return { bookings: await byIds(tx, ids, zone), taken };
  });
}

// Changes one booking (one occurrence of a weekly one): room, time, title,
// people. Its organiser or an admin; not once it is over.
export async function updateRoomBooking(sql: Sql, actor: Member | null, bookingId: unknown, input: RoomInput, zone: string): Promise<{ before: RoomBooking; after: RoomBooking }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const bid = id(bookingId);
  const mine = input.roomId === undefined ? [] : await groupsOf(actor);
  return sql.begin(async tx => {
    const [row] = await tx<{ member_id: string; over: boolean; started: boolean }[]>`
      select member_id, upper(during) <= now() as over, lower(during) <= now() as started from room_bookings where id = ${bid} and cancelled_at is null for update`;
    if (!row) throw new AppError("not_found");
    if (!mayChange(actor, row.member_id)) throw new AppError("forbidden");
    if (row.over) throw new AppError("past");
    const [before] = await byIds(tx, [bid], zone);
    const m = await moment(tx, actor, zone);
    const roomId = input.roomId === undefined ? before!.roomId : id(input.roomId);
    const d = input.day === undefined ? before!.day : day(input.day);
    const s = slot(m, input.start ?? before!.start, input.end ?? before!.end);
    // A meeting under way may run longer or shorter; it keeps its start.
    const keepsStart = row.started && d === before!.day && s.start === before!.start && roomId === before!.roomId;
    if (keepsStart) {
      if (s.end <= m.now && d === m.today) throw new AppError("past");
    } else checkWhen(m, d, s, "room");
    if (roomId !== before!.roomId) await liveRoom(tx, roomId, mine, m.exempt);
    const title = input.title === undefined ? before!.title : clean(input.title, limits.title, { optional: true });
    try {
      await tx.savepoint(async sp => {
        await sp`update room_bookings set room_id = ${roomId}, day = ${d}, during = ${span(sp, d, s.start, s.end, zone)}, title = ${title}, revision = revision + 1, changed_at = now() where id = ${bid}`;
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    if (input.attendees !== undefined) {
      const people = memberIds(input.attendees, limits.attendees).filter(a => a !== before!.memberId);
      await tx`delete from room_attendees where booking_id = ${bid} and not (member_id = any(${people}::text[]))`;
      for (const a of people) await tx`insert into room_attendees (booking_id, member_id) values (${bid}, ${a}) on conflict do nothing`;
    }
    await enqueue(tx, [roomKey(bid)]);
    const [after] = await byIds(tx, [bid], zone);
    return { before: before!, after: after! };
  });
}

// Cancels one booking, or with "following" this one and the next ones of
// its series. Its organiser or an admin; not once it is over.
export async function cancelRoomBooking(sql: Sql, actor: Member | null, bookingId: unknown, scope: "one" | "following", zone: string): Promise<RoomBooking[]> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const bid = id(bookingId);
  return sql.begin(async tx => {
    const [row] = await tx<{ member_id: string; over: boolean; series: string | null }[]>`
      select member_id, upper(during) <= now() as over, series from room_bookings where id = ${bid} and cancelled_at is null for update`;
    if (!row) throw new AppError("not_found");
    if (!mayChange(actor, row.member_id)) throw new AppError("forbidden");
    if (row.over) throw new AppError("past");
    if (scope === "following" && row.series !== null) {
      return cancelRoomBookings(tx, actor.id, zone, tx`series = ${row.series} and lower(during) >= (select lower(during) from room_bookings where id = ${bid}) and upper(during) > now()`);
    }
    return cancelRoomBookings(tx, actor.id, zone, tx`id = ${bid}`);
  });
}

// Undo of a cancellation: the bookings come back if their room is still
// free (and still there); otherwise "taken", and nothing comes back.
export async function restoreRoomBookings(sql: Sql, actor: Member | null, bookingIds: unknown, zone: string): Promise<RoomBooking[]> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  if (!Array.isArray(bookingIds) || bookingIds.length === 0 || bookingIds.length > 60) throw new AppError("invalid");
  const ids = bookingIds.map(id);
  return sql.begin(async tx => {
    const rows = await tx<{ id: string; member_id: string; cancelled_by: string | null }[]>`
      select b.id, b.member_id, b.cancelled_by from room_bookings b join rooms r on r.id = b.room_id
      where b.id = any(${ids}::bigint[]) and b.cancelled_at is not null and r.archived_at is null and upper(b.during) > now()`;
    if (rows.length !== ids.length) throw new AppError("not_found");
    if (!rows.every(r => mayChange(actor, r.member_id) && r.cancelled_by === actor.id)) throw new AppError("forbidden");
    try {
      await tx.savepoint(async sp => {
        await sp`update room_bookings set cancelled_at = null, cancelled_by = null, revision = revision + 1, changed_at = now() where id = any(${ids}::bigint[])`;
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    await enqueue(tx, ids.map(roomKey));
    return byIds(tx, ids, zone);
  });
}

// The day of an office's rooms: every live booking, as the grid draws it.
export async function roomDay(sql: Query, actor: Member | null, officeId: string, d: string, zone: string): Promise<RoomBooking[]> {
  if (!can(actor, "book")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`
    select ${columns(sql, zone)} from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id
    where f.office_id = ${officeId} and b.day = ${d} and b.cancelled_at is null and r.archived_at is null
    order by lower(b.during)`;
  return rows.map(toBooking);
}

// My room bookings from one day to another (organised, or invited to).
export async function myRoomBookings(sql: Query, actor: Member, from: string, to: string, zone: string): Promise<RoomBooking[]> {
  const rows = await sql<Row[]>`
    select ${columns(sql, zone)} from room_bookings b join rooms r on r.id = b.room_id
    where b.day between ${from} and ${to} and b.cancelled_at is null and r.archived_at is null
      and (b.member_id = ${actor.id} or exists (select 1 from room_attendees a where a.booking_id = b.id and a.member_id = ${actor.id}))
    order by b.day, lower(b.during)`;
  return rows.map(toBooking);
}
