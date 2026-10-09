import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { flush } from "./calendar.ts";
import type { Sql } from "./db.ts";
import { id } from "../shared/model.ts";
import { byIds, cancelRoomBookings, type RoomBooking } from "./room-bookings.ts";

// Check-in, as Robin does it against "ghost meetings": a quarter of an hour
// before a meeting its people get a reminder in the bell; when an admin
// turned check-in on (Rules), someone taps "I'm here" from ten minutes
// before its start, and a room nobody checked in to is freed a quarter of
// an hour after it started — its people told. The Chest calls the tool
// every quarter of an hour (Proposal (studio): schedules, "quarter"), so a
// room is freed between 15 and 30 minutes after its start. A room booked
// on the spot (within ten minutes of its start) is taken as checked in.
export { checkInOpens } from "../shared/model.ts";
import { checkInOpens } from "../shared/model.ts";
export const releaseAfter = 15; // minutes after the start

export async function checkIn(sql: Sql, actor: Member | null, bookingId: unknown): Promise<void> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const bid = id(bookingId);
  const [b] = await sql<{ member_id: string; guest: boolean; opens: boolean; over: boolean }[]>`
    select b.member_id, exists (select 1 from room_attendees a where a.booking_id = b.id and a.member_id = ${actor.id}) as guest,
      lower(b.during) - make_interval(mins => ${checkInOpens}) <= now() as opens, upper(b.during) <= now() as over
    from room_bookings b where b.id = ${bid} and b.cancelled_at is null`;
  if (!b) throw new AppError("not_found");
  if (b.member_id !== actor.id && !b.guest && !can(actor, "bookings.any")) throw new AppError("forbidden");
  if (b.over) throw new AppError("past");
  if (!b.opens) throw new AppError("too_early", { minutes: checkInOpens });
  // Freed meanwhile by the quarter's run (nobody had checked in): said so.
  const done = await sql`update room_bookings set checked_in_at = coalesce(checked_in_at, now()) where id = ${bid} and cancelled_at is null returning id`;
  if (done.length === 0) throw new AppError("released");
}

// The quarter's work: who is to be reminded, which rooms are freed.
// Answers both, for the caller to tell (lib/tell.ts) — then remind() marks
// the reminders sent, so a run whose telling failed reminds them again at
// the next run, while the meeting is still to come — and the calendars
// hear of it.
export async function quarter(sql: Sql, zone: string): Promise<{ reminded: RoomBooking[]; released: RoomBooking[] }> {
  const [s] = await sql<{ check_in: boolean }[]>`select check_in from settings`;
  const ids = (await sql<{ id: string }[]>`
    select b.id from room_bookings b join rooms r on r.id = b.room_id and r.archived_at is null
    where b.cancelled_at is null and b.reminded_at is null
      and lower(b.during) > now() and lower(b.during) <= now() + interval '15 minutes'`).map(r => String(r.id));
  const reminded = await byIds(sql, ids, zone);
  const released = s?.check_in
    ? await sql.begin(tx => cancelRoomBookings(tx, "chest", zone, tx`checked_in_at is null and lower(during) <= now() - make_interval(mins => ${releaseAfter}) and upper(during) > now()
      and created_at < lower(during) - make_interval(mins => ${checkInOpens})`))
    : [];
  await flush(sql, zone);
  return { reminded, released };
}

// The reminders told: not again.
export async function remind(sql: Sql, ids: readonly string[]): Promise<void> {
  if (ids.length > 0) await sql`update room_bookings set reminded_at = now() where id = any(${ids as string[]}::bigint[]) and reminded_at is null`;
}
