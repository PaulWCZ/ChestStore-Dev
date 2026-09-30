import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { can, mayChange, roleOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import { checkWhen, conflict, moment, span } from "./booking-rules.ts";
import { dayKey, enqueue } from "./calendar.ts";
import type { Query, Sql } from "./db.ts";
import { groupsOf } from "./groups.ts";
import { addDays, day, id, isPart, memberId, mondayOf, partMinutes, type Part } from "./model.ts";

// Desks booked for a day or half a day. PostgreSQL refuses two live
// bookings of a desk that overlap (desk_taken), and two desks for one
// person at the same time (desk_already). The desk days a member may hold
// in a week are counted under a lock on that member, so two quick clicks
// cannot both pass the limit.

export type DeskBooking = { id: string; deskId: string; deskName: string; areaName: string; areaPreset: string | null; floorName: string; officeId: string; memberId: string; day: string; part: Part; lent: boolean };

type Row = { id: string; desk_id: string; desk_name: string; area_name: string; area_preset: string | null; floor_name: string; office_id: string; member_id: string; day: string; part: Part; lent: boolean };
const toBooking = (r: Row): DeskBooking => ({ id: String(r.id), deskId: String(r.desk_id), deskName: r.desk_name, areaName: r.area_name, areaPreset: r.area_preset, floorName: r.floor_name, officeId: String(r.office_id), memberId: r.member_id, day: r.day, part: r.part, lent: r.lent === true });

const select = (sql: Query) => sql`
  select b.cancelled_by, b.id, b.desk_id, d.name as desk_name, a.name as area_name, a.preset as area_preset, f.name as floor_name, f.office_id, b.member_id, to_char(b.day, 'YYYY-MM-DD') as day, b.part, b.lent
  from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id`;

// Books a desk. Booking a desk also says "at the office" that day. With
// move, a desk of mine at the same time is freed first (I change desks):
// its booking is in replaced, for an undo. An admin may book for someone
// else (for: a member who has the tool; the caller tells them).
//
// A desk given to someone is theirs, except on a day they said they are
// remote or off (and did not keep it): it is then lent (lent: true). An
// area kept for a group is booked by its members, and by admins.
export async function bookDesk(sql: Sql, actor: Member | null, input: { deskId?: unknown; day?: unknown; part?: unknown; move?: boolean; for?: unknown }, zone: string): Promise<DeskBooking & { replaced: string[]; lent: boolean }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const deskId = id(input.deskId);
  const d = day(input.day);
  if (input.part !== undefined && !isPart(input.part)) throw new AppError("invalid");
  const part: Part = isPart(input.part) ? input.part : "day";
  const [start, end] = partMinutes[part];
  const who = await bookedFor(actor, input.for);
  return sql.begin(async tx => {
    const m = await moment(tx, actor, zone);
    checkWhen(m, d, { start, end }, "desk");
    const [desk] = await tx<{ assigned_to: string | null; office_id: string; group_id: string | null }[]>`
      select d.assigned_to, f.office_id, a.group_id from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
      where d.id = ${deskId} and d.archived_at is null`;
    if (!desk) throw new AppError("not_found");
    if (desk.group_id !== null && !m.exempt && !who.groups.includes(desk.group_id)) throw new AppError("group_only");
    let lent = false;
    if (desk.assigned_to !== null && desk.assigned_to !== who.id) {
      const [away] = await tx<{ lends: boolean }[]>`
        select coalesce((select lend_desk from member_prefs where member_id = ${desk.assigned_to}), true) as lends
        from presence where member_id = ${desk.assigned_to} and day = ${d} and status in ('remote', 'off')`;
      if (!away?.lends) throw new AppError("assigned");
      lent = true;
    }
    await tx`select pg_advisory_xact_lock(hashtext('desk-days'), hashtext(${who.id}))`;
    if (m.rules.maxDeskDays !== null && !m.exempt) {
      const monday = mondayOf(d);
      const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`
        select count(distinct day)::int as n from desk_bookings
        where member_id = ${who.id} and cancelled_at is null and day between ${monday} and ${addDays(monday, 6)} and day <> ${d}`;
      if (n >= m.rules.maxDeskDays) throw new AppError("desk_limit", { max: m.rules.maxDeskDays });
    }
    const replaced = input.move
      ? (await tx<{ id: string }[]>`
          update desk_bookings set cancelled_at = now(), cancelled_by = ${actor.id}
          where member_id = ${who.id} and cancelled_at is null and desk_id <> ${deskId} and during && ${span(tx, d, start, end, zone)}
          returning id`).map(r => String(r.id))
      : [];
    let bookingId: string;
    try {
      bookingId = await tx.savepoint(async sp => {
        const [row] = await sp<{ id: string }[]>`
          insert into desk_bookings (desk_id, member_id, day, part, during, lent)
          values (${deskId}, ${who.id}, ${d}, ${part}, ${span(sp, d, start, end, zone)}, ${lent}) returning id`;
        return String(row!.id);
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    await tx`
      insert into presence (member_id, day, status, office_id) values (${who.id}, ${d}, 'office', ${desk.office_id})
      on conflict (member_id, day) do update set status = 'office', office_id = excluded.office_id, leave_ref = null, usual = false`;
    await enqueue(tx, [dayKey(who.id, d)]);
    const [booking] = await tx<Row[]>`${select(tx)} where b.id = ${bookingId}`;
    return { ...toBooking(booking!), replaced, lent };
  });
}

// Whom a booking is for: the actor, or — for an admin — a member who has
// the tool (someone unknown to the Chest, or without a role here, is not
// found). Their groups come with them — every group they are in, not only
// those that give Rooms (groupsOf) — for areas and rooms kept for a group.
export async function bookedFor(actor: Member, value: unknown): Promise<{ id: string; groups: string[] }> {
  if (value === undefined || value === null || value === "" || value === actor.id) return { id: actor.id, groups: await groupsOf(actor) };
  if (!can(actor, "bookings.any")) throw new AppError("forbidden");
  const target = await members.get(memberId(value));
  if (!target || roleOf(target) === null) throw new AppError("not_found");
  return { id: target.id, groups: await groupsOf(target) };
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
    await enqueue(tx, [dayKey(row.member_id, row.day)]);
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
    // Given to someone meanwhile, or its holder is back: not lent any more.
    const [held] = await tx<{ free: boolean }[]>`
      select d.assigned_to is null or d.assigned_to = ${row.member_id}
        or (exists (select 1 from presence p where p.member_id = d.assigned_to and p.day = ${row.day} and p.status in ('remote', 'off'))
            and coalesce((select lend_desk from member_prefs where member_id = d.assigned_to), true)) as free
      from desks d where d.id = ${row.desk_id}`;
    if (!held?.free) throw new AppError("assigned");
    try {
      await tx.savepoint(async sp => {
        await sp`update desk_bookings set cancelled_at = null, cancelled_by = null where id = ${bid}`;
      });
    } catch (error) {
      throw conflict(error) ?? error;
    }
    if (row.member_id === actor.id) {
      await tx`insert into presence (member_id, day, status, office_id) values (${actor.id}, ${row.day}, 'office', ${row.office_id})
        on conflict (member_id, day) do update set status = 'office', office_id = excluded.office_id, usual = false`;
    }
    await enqueue(tx, [dayKey(row.member_id, row.day)]);
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
// else the one they chose in their usual week, else the one they booked
// last (in the last two months).
export async function usualDesk(sql: Query, actor: Member, officeId: string): Promise<{ id: string; name: string; areaName: string; areaPreset: string | null; assigned: boolean } | null> {
  const [assigned] = await sql<{ id: string; name: string; area_name: string; area_preset: string | null }[]>`
    select d.id, d.name, a.name as area_name, a.preset as area_preset from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    where d.assigned_to = ${actor.id} and d.archived_at is null and f.office_id = ${officeId}`;
  if (assigned) return { id: String(assigned.id), name: assigned.name, areaName: assigned.area_name, areaPreset: assigned.area_preset, assigned: true };
  const [chosen] = await sql<{ id: string; name: string; area_name: string; area_preset: string | null }[]>`
    select d.id, d.name, a.name as area_name, a.preset as area_preset from member_prefs p join desks d on d.id = p.usual_desk join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    where p.member_id = ${actor.id} and d.archived_at is null and d.assigned_to is null and f.office_id = ${officeId}`;
  if (chosen) return { id: String(chosen.id), name: chosen.name, areaName: chosen.area_name, areaPreset: chosen.area_preset, assigned: false };
  const [last] = await sql<{ id: string; name: string; area_name: string; area_preset: string | null }[]>`
    select d.id, d.name, a.name as area_name, a.preset as area_preset from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    where b.member_id = ${actor.id} and b.cancelled_at is null and d.archived_at is null and d.assigned_to is null and f.office_id = ${officeId}
      and b.day > current_date - 60
    order by b.day desc, b.id desc limit 1`;
  return last ? { id: String(last.id), name: last.name, areaName: last.area_name, areaPreset: last.area_preset, assigned: false } : null;
}

// The desks given to someone that are lent on a day: their holder said
// they are remote or off, and did not keep their desk. Desk id → holder.
export async function lentDesks(sql: Query, officeId: string, d: string): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; holder: string }[]>`
    select d.id, d.assigned_to as holder
    from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
    join presence p on p.member_id = d.assigned_to and p.day = ${d} and p.status in ('remote', 'off')
    left join member_prefs m on m.member_id = d.assigned_to
    where f.office_id = ${officeId} and d.archived_at is null and coalesce(m.lend_desk, true)`;
  return new Map(rows.map(r => [String(r.id), r.holder]));
}
