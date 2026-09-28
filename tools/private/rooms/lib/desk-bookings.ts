import type { Member } from "@argentic/chest-sdk/member";
import { can, mayChange } from "./access.ts";
import { AppError } from "./app-error.ts";
import { checkWhen, conflict, moment, span } from "./booking-rules.ts";
import type { Query, Sql } from "./db.ts";
import { addDays, day, id, isPart, mondayOf, partMinutes, type Part } from "./model.ts";

// Desks booked for a day or half a day. PostgreSQL refuses two live
// bookings of a desk that overlap (desk_taken), and two desks for one
// person at the same time (desk_already). The desk days a member may hold
// in a week are counted under a lock on that member, so two quick clicks
// cannot both pass the limit.

export type DeskBooking = { id: string; deskId: string; deskName: string; areaName: string; floorName: string; officeId: string; memberId: string; day: string; part: Part };

type Row = { id: string; desk_id: string; desk_name: string; area_name: string; floor_name: string; office_id: string; member_id: string; day: string; part: Part };
const toBooking = (r: Row): DeskBooking => ({ id: String(r.id), deskId: String(r.desk_id), deskName: r.desk_name, areaName: r.area_name, floorName: r.floor_name, officeId: String(r.office_id), memberId: r.member_id, day: r.day, part: r.part });

const select = (sql: Query) => sql`
  select b.cancelled_by, b.id, b.desk_id, d.name as desk_name, a.name as area_name, f.name as floor_name, f.office_id, b.member_id, to_char(b.day, 'YYYY-MM-DD') as day, b.part
  from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id`;

// Books a desk. Booking a desk also says "at the office" that day. With
// move, a desk of mine at the same time is freed first (I change desks):
// its booking is in replaced, for an undo.
export async function bookDesk(sql: Sql, actor: Member | null, input: { deskId?: unknown; day?: unknown; part?: unknown; move?: boolean }, zone: string): Promise<DeskBooking & { replaced: string[] }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const deskId = id(input.deskId);
  const d = day(input.day);
  if (input.part !== undefined && !isPart(input.part)) throw new AppError("invalid");
  const part: Part = isPart(input.part) ? input.part : "day";
  const [start, end] = partMinutes[part];
  return sql.begin(async tx => {
    const m = await moment(tx, actor, zone);
    checkWhen(m, d, { start, end }, "desk");
    const [desk] = await tx<{ assigned_to: string | null; office_id: string }[]>`
      select d.assigned_to, f.office_id from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
      where d.id = ${deskId} and d.archived_at is null`;
    if (!desk) throw new AppError("not_found");
    if (desk.assigned_to !== null && desk.assigned_to !== actor.id) throw new AppError("assigned");
    await tx`select pg_advisory_xact_lock(hashtext('desk-days'), hashtext(${actor.id}))`;
    if (m.rules.maxDeskDays !== null && !m.exempt) {
      const monday = mondayOf(d);
      const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
        select count(distinct day)::int as n from desk_bookings
        where member_id = ${actor.id} and cancelled_at is null and day between ${monday} and ${addDays(monday, 6)} and day <> ${d}`;
      if (n >= m.rules.maxDeskDays) throw new AppError("desk_limit", { max: m.rules.maxDeskDays });
    }
    const replaced = input.move
      ? (await tx<{ id: string }[]>`
          update desk_bookings set cancelled_at = now(), cancelled_by = ${actor.id}
          where member_id = ${actor.id} and cancelled_at is null and desk_id <> ${deskId} and during && ${span(tx, d, start, end, zone)}
          returning id`).map(r => String(r.id))
      : [];
    let bookingId: string;
    try {
      bookingId = await tx.savepoint(async sp => {
        const [row] = await sp<{ id: string }[]>`
          insert into desk_bookings (desk_id, member_id, day, part, during)
          values (${deskId}, ${actor.id}, ${d}, ${part}, ${span(sp, d, start, end, zone)}) returning id`;
        return String(row!.id);
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    await tx`
      insert into presence (member_id, day, status, office_id) values (${actor.id}, ${d}, 'office', ${desk.office_id})
      on conflict (member_id, day) do update set status = 'office', office_id = excluded.office_id`;
    const [booking] = await tx<Row[]>`${select(tx)} where b.id = ${bookingId}`;
    return { ...toBooking(booking!), replaced };
  });
}

// Cancels a desk booking: its holder or an admin, until it is over.
export async function cancelDesk(sql: Sql, actor: Member | null, bookingId: unknown): Promise<DeskBooking> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const bid = id(bookingId);
  return sql.begin(async tx => {
    const [row] = await tx<(Row & { over: boolean })[]>`${select(tx)}, lateral (select upper(b.during) <= now() as over) o where b.id = ${bid} and b.cancelled_at is null for update of b`;
    if (!row) throw new AppError("not_found");
    if (!mayChange(actor, row.member_id)) throw new AppError("forbidden");
    if (row.over) throw new AppError("past");
    await tx`update desk_bookings set cancelled_at = now(), cancelled_by = ${actor.id} where id = ${bid}`;
    return toBooking(row);
  });
}

// Undo of a cancellation, by whoever cancelled it: back if still free.
export async function restoreDesk(sql: Sql, actor: Member | null, bookingId: unknown): Promise<DeskBooking> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const bid = id(bookingId);
  return sql.begin(async tx => {
    const [row] = await tx<(Row & { cancelled_by: string | null })[]>`
      ${select(tx)} where b.id = ${bid} and b.cancelled_at is not null and d.archived_at is null and upper(b.during) > now()`;
    if (!row) throw new AppError("not_found");
    if (row.cancelled_by !== actor.id || !mayChange(actor, row.member_id)) throw new AppError("forbidden");
    try {
      await tx.savepoint(async sp => {
        await sp`update desk_bookings set cancelled_at = null, cancelled_by = null where id = ${bid}`;
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    if (row.member_id === actor.id) {
      await tx`insert into presence (member_id, day, status, office_id) values (${actor.id}, ${row.day}, 'office', ${row.office_id})
        on conflict (member_id, day) do update set status = 'office', office_id = excluded.office_id`;
    }
    return toBooking(row);
  });
}

// The live desk bookings of an office on a day (the floor view).
export async function deskDay(sql: Query, actor: Member | null, officeId: string, d: string): Promise<DeskBooking[]> {
  if (!can(actor, "book")) throw new AppError("forbidden");
  const rows = await sql<Row[]>`${select(sql)} where f.office_id = ${officeId} and b.day = ${d} and b.cancelled_at is null and d.archived_at is null order by d.position, d.id, b.part`;
  return rows.map(toBooking);
}

// Live desk bookings of some people between two days (the week, "where is").
export async function deskBookingsOf(sql: Query, people: readonly string[], from: string, to: string): Promise<DeskBooking[]> {
  if (people.length === 0) return [];
  const rows = await sql<Row[]>`${select(sql)} where b.member_id = any(${people as string[]}::text[]) and b.day between ${from} and ${to} and b.cancelled_at is null and d.archived_at is null order by b.day, b.part`;
  return rows.map(toBooking);
}

// Live bookings of one desk between two days (is my usual desk free?).
export async function deskBookingsOn(sql: Query, deskId: string, from: string, to: string): Promise<DeskBooking[]> {
  const rows = await sql<Row[]>`${select(sql)} where b.desk_id = ${deskId} and b.day between ${from} and ${to} and b.cancelled_at is null`;
  return rows.map(toBooking);
}

// The desk a member usually sits at in an office: the one given to them,
// else the one they booked last (in the last two months).
export async function usualDesk(sql: Query, actor: Member, officeId: string): Promise<{ id: string; name: string; areaName: string; assigned: boolean } | null> {
  const [assigned] = await sql<{ id: string; name: string; area_name: string }[]>`
    select d.id, d.name, a.name as area_name from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    where d.assigned_to = ${actor.id} and d.archived_at is null and f.office_id = ${officeId}`;
  if (assigned) return { id: String(assigned.id), name: assigned.name, areaName: assigned.area_name, assigned: true };
  const [last] = await sql<{ id: string; name: string; area_name: string }[]>`
    select d.id, d.name, a.name as area_name from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    where b.member_id = ${actor.id} and b.cancelled_at is null and d.archived_at is null and d.assigned_to is null and f.office_id = ${officeId}
      and b.day > current_date - 60
    order by b.day desc, b.id desc limit 1`;
  return last ? { id: String(last.id), name: last.name, areaName: last.area_name, assigned: false } : null;
}
