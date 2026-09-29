import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query, Sql } from "./db.ts";
import { dayKey, enqueue } from "./calendar.ts";
import { cancelDeskBookings } from "./places.ts";
import { day, daysBetween, id, isStatus, today, type Status } from "./model.ts";

// Where each member works on a day: at the office, remote, or off. Said by
// the member, for themselves, from today on. Saying "remote" or "off" frees
// the desk they booked that day (the page offers to undo it).

export const presenceHorizon = 90;

export type Said = { status: Status; officeId: string | null };

export async function setPresence(sql: Sql, actor: Member | null, input: { day?: unknown; status?: unknown; officeId?: unknown }, zone: string): Promise<{ previous: Said | null; freed: string[] }> {
  if (!actor || !can(actor, "book")) throw new AppError("forbidden");
  const d = day(input.day);
  if (input.status !== null && !isStatus(input.status)) throw new AppError("invalid");
  const status: Status | null = isStatus(input.status) ? input.status : null;
  const now = today(zone);
  if (d < now) throw new AppError("past");
  if (daysBetween(now, d) > presenceHorizon) throw new AppError("too_far", { max: presenceHorizon });
  return sql.begin(async tx => {
    const [before] = await tx<{ status: Status; office_id: string | null }[]>`select status, office_id from presence where member_id = ${actor.id} and day = ${d} for update`;
    const previous: Said | null = before ? { status: before.status, officeId: before.office_id === null ? null : String(before.office_id) } : null;
    let freed: string[] = [];
    // The person said it: their usual week never changes this day again.
    await tx`insert into usual_applied (member_id, day) values (${actor.id}, ${d}) on conflict do nothing`;
    await enqueue(tx, [dayKey(actor.id, d)]);
    if (status === null) {
      await tx`delete from presence where member_id = ${actor.id} and day = ${d}`;
    } else {
      let office: string | null = null;
      if (status === "office") {
        if (input.officeId !== undefined && input.officeId !== null) {
          office = id(input.officeId);
          const [found] = await tx`select 1 from offices where id = ${office}`;
          if (!found) throw new AppError("not_found");
        } else {
          const [chosen] = await tx<{ id: string }[]>`
            select coalesce((select office_id from member_prefs where member_id = ${actor.id}), (select id from offices order by position, id limit 1)) as id`;
          office = chosen?.id === null || chosen?.id === undefined ? null : String(chosen.id);
        }
      } else {
        freed = (await cancelDeskBookings(tx, actor.id, tx`b.member_id = ${actor.id} and b.day = ${d} and upper(b.during) > now()`)).map(b => b.id);
      }
      await tx`
        insert into presence (member_id, day, status, office_id) values (${actor.id}, ${d}, ${status}, ${office})
        on conflict (member_id, day) do update set status = excluded.status, office_id = excluded.office_id, leave_ref = null, usual = false`;
    }
    return { previous, freed };
  });
}

// What some people said for some days: member → day → said.
export async function presenceOf(sql: Query, people: readonly string[], from: string, to: string): Promise<Map<string, Map<string, Said>>> {
  const found = new Map<string, Map<string, Said>>();
  if (people.length === 0) return found;
  const rows = await sql<{ member_id: string; day: string; status: Status; office_id: string | null }[]>`
    select member_id, to_char(day, 'YYYY-MM-DD') as day, status, office_id from presence
    where member_id = any(${people as string[]}::text[]) and day between ${from} and ${to}`;
  for (const r of rows) {
    const days = found.get(r.member_id) ?? new Map<string, Said>();
    days.set(r.day, { status: r.status, officeId: r.office_id === null ? null : String(r.office_id) });
    found.set(r.member_id, days);
  }
  return found;
}

// Who is at an office each day: said "office" there (or without an office
// named), holds a desk there, or is in a meeting in one of its rooms (the
// organiser and the guests) — unless they said "remote" or "off" that day.
// Day → member ids. Without an office yet (null): whoever said "office".
export async function atOffice(sql: Query, officeId: string | null, from: string, to: string): Promise<Map<string, string[]>> {
  const rows = officeId === null
    ? await sql<{ day: string; member_id: string }[]>`
      select to_char(day, 'YYYY-MM-DD') as day, member_id from presence
        where day between ${from} and ${to} and status = 'office'
      order by 1, 2`
    : await sql<{ day: string; member_id: string }[]>`
      select to_char(day, 'YYYY-MM-DD') as day, member_id from presence
        where day between ${from} and ${to} and status = 'office' and (office_id = ${officeId} or office_id is null)
      union
      select to_char(x.day, 'YYYY-MM-DD'), x.member_id from (
        select b.day, b.member_id from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id
          where b.day between ${from} and ${to} and b.cancelled_at is null and f.office_id = ${officeId}
        union
        select b.day, m.member_id from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id
          cross join lateral (select b.member_id union select a.member_id from room_attendees a where a.booking_id = b.id) m
          where b.day between ${from} and ${to} and b.cancelled_at is null and r.archived_at is null and f.office_id = ${officeId}
      ) x
        where x.member_id <> 'erased' and not exists (select 1 from presence p where p.member_id = x.member_id and p.day = x.day and p.status <> 'office')
      order by 1, 2`;
  const found = new Map<string, string[]>();
  for (const r of rows) found.set(r.day, [...(found.get(r.day) ?? []), r.member_id]);
  return found;
}

// The days some people are in a meeting of a room (as its organiser or a
// guest): member → days. "Who's where" counts them at the office on a day
// they said nothing.
export async function inMeetings(sql: Query, people: readonly string[], from: string, to: string): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  if (people.length === 0) return found;
  const rows = await sql<{ member_id: string; day: string }[]>`
    select distinct m.member_id, to_char(b.day, 'YYYY-MM-DD') as day
    from room_bookings b join rooms r on r.id = b.room_id
      cross join lateral (select b.member_id union select a.member_id from room_attendees a where a.booking_id = b.id) m
    where b.day between ${from} and ${to} and b.cancelled_at is null and r.archived_at is null and m.member_id = any(${people as string[]}::text[])`;
  for (const r of rows) found.set(r.member_id, (found.get(r.member_id) ?? new Set()).add(r.day));
  return found;
}
