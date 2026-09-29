import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { dayKey, eventOf, icsFile, roomEvents, type Event } from "./calendar.ts";
import { toCsv } from "./csv.ts";
import type { Sql } from "./db.ts";
import { formatTime, type Catalogue, type Locale } from "./i18n/index.ts";
import { id, today } from "./model.ts";
import { nameOf, people } from "./people.ts";

// A member's own downloads: one booking, or all their coming bookings and
// office days, as an .ics file for any calendar app; and everything Rooms
// keeps about them, as a CSV (their right of access, without asking an
// admin).

type Origin = { domain: string; origin: string | null };

export async function bookingIcs(sql: Sql, actor: Member | null, bookingId: unknown, locale: Locale, o: Origin): Promise<string> {
  if (!can(actor, "book")) throw new AppError("forbidden");
  const [e] = await roomEvents(sql, [id(bookingId)]);
  if (!e || e.cancelled) throw new AppError("not_found");
  return icsFile([e], locale, o);
}

export async function myIcs(sql: Sql, actor: Member | null, locale: Locale, zone: string, o: Origin & { name: string }): Promise<string> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const from = today(zone);
  const rooms = await sql<{ id: string }[]>`
    select b.id from room_bookings b
    where b.cancelled_at is null and b.day >= ${from}
      and (b.member_id = ${actor.id} or exists (select 1 from room_attendees a where a.booking_id = b.id and a.member_id = ${actor.id}))
    order by b.day limit 500`;
  const days = await sql<{ day: string }[]>`
    select to_char(day, 'YYYY-MM-DD') as day from presence where member_id = ${actor.id} and status = 'office' and day >= ${from}
    union select to_char(day, 'YYYY-MM-DD') from desk_bookings where member_id = ${actor.id} and cancelled_at is null and day >= ${from}
    order by 1 limit 500`;
  const events: Event[] = (await roomEvents(sql, rooms.map(r => String(r.id)))).filter(e => !e.cancelled);
  for (const d of days) {
    const e = await eventOf(sql, dayKey(actor.id, d.day), zone);
    if (e) events.push(e);
  }
  return icsFile(events, locale, o);
}

export async function myCsv(sql: Sql, actor: Member | null, t: Catalogue, locale: Locale, zone: string): Promise<string> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  // The names the tool gave (floors, areas) in the reader's language.
  const presets = JSON.stringify(t.presets);
  const rows = await sql<{ day: string; kind: "desk" | "room" | "presence" | "visit"; office: string; place: string; start: number | null; end: number | null; title: string; organiser: string; status: string }[]>`
    select to_char(b.day, 'YYYY-MM-DD') as day, 'desk' as kind, o.name as office, d.name || ' · ' || coalesce(${presets}::text::jsonb ->> a.preset, a.name) as place,
      (extract(epoch from (lower(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as start,
      (extract(epoch from (upper(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int as "end",
      '' as title, b.member_id as organiser, case when b.cancelled_at is null then 'booked' else 'cancelled' end as status
    from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id join offices o on o.id = f.office_id
    where b.member_id = ${actor.id}
    union all
    select to_char(b.day, 'YYYY-MM-DD'), 'room', o.name, r.name,
      (extract(epoch from (lower(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int,
      (extract(epoch from (upper(b.during) at time zone ${zone}) - b.day::timestamp) / 60)::int,
      b.title, b.member_id, case when b.cancelled_at is null then 'booked' else 'cancelled' end
    from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id join offices o on o.id = f.office_id
    where b.member_id = ${actor.id} or exists (select 1 from room_attendees x where x.booking_id = b.id and x.member_id = ${actor.id})
    union all
    select to_char(p.day, 'YYYY-MM-DD'), 'presence', coalesce(o.name, ''), '', null, null, '', p.member_id, p.status
    from presence p left join offices o on o.id = p.office_id
    where p.member_id = ${actor.id}
    union all
    select to_char(v.day, 'YYYY-MM-DD'), 'visit', coalesce(o.name, ''), v.name || case when v.company = '' then '' else ' · ' || v.company end, v.at_minute, null, '', v.created_by,
      case when v.cancelled_at is null then 'booked' else 'cancelled' end
    from visits v left join offices o on o.id = v.office_id
    where v.host = ${actor.id}
    order by 1, 2, 5`;
  const who = await people(rows.map(r => r.organiser));
  const c = t.mine.columns;
  return toCsv([
    [c.date, c.kind, c.office, c.place, c.start, c.end, c.title, c.bookedBy, c.status],
    ...rows.map(r => [
      r.day, t.mine.kinds[r.kind], r.office, r.place,
      r.start === null ? "" : formatTime(Number(r.start), locale), r.end === null ? "" : formatTime(Number(r.end), locale),
      r.title, r.kind === "presence" ? "" : r.organiser === actor.id ? t.people.you : nameOf(who.get(r.organiser), locale),
      r.kind === "presence" ? t.status[r.status as "office" | "remote" | "off"] : t.mine.states[r.status as "booked" | "cancelled"],
    ]),
  ]);
}

// Where the tool is, for the links and the UIDs of a file: the Chest's
// address of its team host (null outside a Chest: the file has no links).
export function origin(url: string | null): Origin {
  return { domain: url ? new URL(url).hostname : "rooms.invalid", origin: url };
}

export function calendarHeaders(name: string): Record<string, string> {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/gu, "")}"`,
    "Cache-Control": "no-store",
  };
}
