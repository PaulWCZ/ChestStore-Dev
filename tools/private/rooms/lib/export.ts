import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { formatTime, type Catalogue, type Locale } from "./i18n/index.ts";
import { day, daysBetween, limits } from "./model.ts";
import { nameOf, people } from "./people.ts";

// The admin's downloads, in their language: every booking of a period, and
// the occupancy of each office day by day (counts only: planning space
// needs no names).

function period(fromValue: unknown, toValue: unknown): { from: string; to: string } {
  const from = day(fromValue);
  const to = day(toValue);
  if (to < from || daysBetween(from, to) >= limits.exportDays) throw new AppError("invalid");
  return { from, to };
}

export async function bookingsCsv(sql: Sql, actor: Member | null, fromValue: unknown, toValue: unknown, t: Catalogue, locale: Locale, zone: string): Promise<string> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const { from, to } = period(fromValue, toValue);
  const rows = await sql<{ day: string; kind: "desk" | "room"; office: string; floor: string; place: string; start: number; end: number; member_id: string; title: string; people: number }[]>`
    select to_char(b.day, 'YYYY-MM-DD') as day, 'desk' as kind, o.name as office, f.name as floor, d.name || ' · ' || a.name as place,
      (extract(epoch from (lower(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as start,
      (extract(epoch from (upper(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as "end",
      b.member_id, '' as title, 0 as people
    from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id join offices o on o.id = f.office_id
    where b.cancelled_at is null and b.day between ${from} and ${to}
    union all
    select to_char(b.day, 'YYYY-MM-DD'), 'room', o.name, f.name, r.name,
      (extract(epoch from (lower(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int,
      (extract(epoch from (upper(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int,
      b.member_id, b.title, (select count(*)::int from room_attendees x where x.booking_id = b.id)
    from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id join offices o on o.id = f.office_id
    where b.cancelled_at is null and b.day between ${from} and ${to}
    order by 1, 3, 2, 6, 5`;
  const who = await people(rows.map(r => r.member_id));
  const c = t.export.columns;
  return toCsv([
    [c.date, c.kind, c.office, c.floor, c.place, c.start, c.end, c.bookedBy, c.title, c.people],
    ...rows.map(r => [r.day, t.export.kinds[r.kind], r.office, r.floor, r.place, formatTime(Number(r.start), locale), formatTime(Number(r.end), locale), nameOf(who.get(r.member_id), locale), r.title, r.kind === "room" ? r.people : ""]),
  ]);
}

export async function occupancyCsv(sql: Sql, actor: Member | null, fromValue: unknown, toValue: unknown, t: Catalogue): Promise<string> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const { from, to } = period(fromValue, toValue);
  const rows = await sql<{ day: string; office: string; at_office: number; desks_booked: number; desks: number; room_minutes: number }[]>`
    with days as (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day)
    select to_char(x.day, 'YYYY-MM-DD') as day, o.name as office,
      (select count(distinct m)::int from (
        select p.member_id as m from presence p where p.day = x.day and p.status = 'office' and (p.office_id = o.id or (p.office_id is null and o.id = (select id from offices order by position, id limit 1)))
        union
        select b.member_id from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
        where b.day = x.day and b.cancelled_at is null and f.office_id = o.id) s) as at_office,
      (select count(distinct b.desk_id)::int from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
        where b.day = x.day and b.cancelled_at is null and f.office_id = o.id) as desks_booked,
      (select count(*)::int from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id where f.office_id = o.id and d.archived_at is null) as desks,
      (select coalesce(sum(extract(epoch from (upper(b.during) - lower(b.during))) / 60), 0)::int from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id
        where b.day = x.day and b.cancelled_at is null and f.office_id = o.id) as room_minutes
    from days x cross join offices o
    order by x.day, o.position, o.id`;
  const c = t.export.columns;
  return toCsv([
    [c.date, c.office, c.atOffice, c.desksBooked, c.desks, c.deskRate, c.roomHours],
    ...rows.map(r => [r.day, r.office, r.at_office, r.desks_booked, r.desks, r.desks > 0 ? Math.round((100 * r.desks_booked) / r.desks) : "", Math.round(r.room_minutes / 6) / 10]),
  ]);
}

// How full the office is on each working day of the week, on average over
// the last weeks: people at the office and desks booked (counts only). For
// the admin's "which days are busy?" at a glance.
export type WeekdayLoad = { weekday: number; people: number; desks: number; days: number };

export async function weekdayLoad(sql: Sql, actor: Member | null, officeId: string, zone: string, weeks = 8): Promise<{ loads: WeekdayLoad[]; desks: number }> {
  if (!can(actor, "export")) throw new AppError("forbidden");
  const rows = await sql<{ weekday: number; people: number; desks: number; days: number }[]>`
    with days as (
      select d::date as day from generate_series((now() at time zone ${zone})::date - ${weeks * 7}::int, (now() at time zone ${zone})::date - 1, interval '1 day') d
    ), per_day as (
      select x.day,
        (select count(distinct m)::int from (
          select p.member_id as m from presence p where p.day = x.day and p.status = 'office' and (p.office_id = ${officeId} or p.office_id is null)
          union
          select b.member_id from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
          where b.day = x.day and b.cancelled_at is null and f.office_id = ${officeId}) s) as people,
        (select count(distinct b.desk_id)::int from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
          where b.day = x.day and b.cancelled_at is null and f.office_id = ${officeId}) as desks
      from days x
    )
    select extract(isodow from day)::int as weekday, avg(people)::float as people, avg(desks)::float as desks, count(*)::int as days
    from per_day group by 1 order by 1`;
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
    select count(*)::int as n from desks d join areas a on a.id = d.area_id join floors f on f.id = a.floor_id where f.office_id = ${officeId} and d.archived_at is null`;
  return { loads: rows.map(r => ({ weekday: Number(r.weekday), people: Number(r.people), desks: Number(r.desks), days: Number(r.days) })), desks: n };
}
