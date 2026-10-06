import * as calendar from "@argentic/chest-sdk/calendar";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Query, Sql } from "./db.ts";
import { catalogue, format, locales, type Catalogue, type Locale } from "../i18n/index.ts";
import { addDays, today } from "../shared/model.ts";

// The members' calendars (Proposal (studio): "calendar": true). Every room
// booking is an event in the Chest calendar feed of its organiser and its
// guests; every day someone is at the office (with their desk) is a whole
// day shown "free" in their own feed. The member adds that feed once to
// Google Calendar, Outlook or Apple Calendar; Rooms never serves a feed.
//
// How it stays right: whatever changes a booking or a day writes its key in
// calendar_queue, in the same transaction (enqueue). flush() then reads
// each queued key's state in the database and puts or removes the event —
// so a cancel, a move, a guest added or a member leaving all end the same
// way, and a Chest that did not answer is simply asked again at the next
// change or page read. Keys: room:<booking id>, day:<member id>:<YYYY-MM-DD>.
//
// An event leaves the calendars a month after it is over (keepDays): the
// Chest keeps 5,000 events per tool, and a year of every desk day of a
// company would not fit (calendar_sent says what is there, and until when).
//
// On a Chest without the calendar, flush() learns it (settings.calendar =
// 'off'), asks again at most once an hour, and the pages offer their .ics
// files instead ("Add to my calendar").

export const roomKey = (id: string) => `room:${id}`;
export const dayKey = (member: string, day: string) => `day:${member}:${day}`;
// The key the Chest and the .ics files know a room booking by: its own
// salt makes it unique across a restored database (migrations/0008);
// bookings made before keep room:<id>.
export const calendarKeyOf = (id: string, salt: string | null) => (salt ? `room:${id}:${salt}` : roomKey(id));
// The Chest's page of the member's calendar feed (on the team host): how
// to add it to Google Calendar, Outlook or Apple Calendar.
export const feedPage = "/_chest/calendar";
export const keepDays = 30;

export async function enqueue(tx: Query, keys: Iterable<string>): Promise<void> {
  const unique = [...new Set(keys)].filter(k => calendar.keyPattern.test(k) && !k.includes("erased"));
  if (unique.length === 0) return;
  await tx`insert into calendar_queue (key) select unnest(${unique}::text[]) on conflict (key) do update set queued_at = now()`;
}

// The days (member, day) a change touched, as keys.
export const dayKeys = (rows: readonly { memberId: string; day: string }[]) => rows.filter(r => r.memberId.startsWith("mbr_")).map(r => dayKey(r.memberId, r.day));

export type State = "unknown" | "on" | "off";
export async function state(sql: Query): Promise<State> {
  const [row] = await sql<{ calendar: State }[]>`select calendar from settings`;
  return row?.calendar ?? "unknown";
}

// An event as a calendar shows it: in every language of the tool (the
// Chest picks each member's), or in one (a file to download).
type Words = Partial<Record<Locale, string>>;
export type Event = {
  // The queue's key (room:<id>, day:<member>:<day>).
  key: string;
  // The key the Chest and the files know it by (calendarKeyOf).
  calendarKey: string;
  members: string[];
  title: Words;
  description?: Words;
  location?: string;
  path: string;
  busy: boolean;
  stamp: Date;
  sequence: number;
  // The last day it covers (in the Chest's time zone).
  lastDay: string;
} & ({ start: Date; end: Date } | { days: { first: string; last: string } });

const inAll = (text: (t: Catalogue, locale: Locale) => string): Words => Object.fromEntries(locales.map(l => [l, text(catalogue(l), l)]));
const bounded = (text: string, max: number) => {
  const chars = [...text.replace(/\s+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
};
const place = (...parts: (string | null | undefined)[]) => bounded(parts.filter(p => p && p.trim()).join(" · "), 200);

// roomEvents reads room bookings as calendar events, cancelled ones too
// (an email that withdraws them): by id, in time order.
export async function roomEvents(sql: Query, ids: readonly string[]): Promise<(Event & { cancelled: boolean; organiser: string; attendees: string[] })[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string; uid_salt: string | null; title: string; room: string; floor: string; office: string; address: string; member_id: string; day: string; start: Date; end: Date; attendees: string[]; revision: number; changed_at: Date; cancelled: boolean }[]>`
    select b.id, b.uid_salt, b.title, r.name as room, f.name as floor, o.name as office, o.address, b.member_id, to_char(b.day, 'YYYY-MM-DD') as day,
      lower(b.during) as start, upper(b.during) as "end", b.revision, b.changed_at, (b.cancelled_at is not null or r.archived_at is not null) as cancelled,
      coalesce((select array_agg(a.member_id order by a.member_id) from room_attendees a where a.booking_id = b.id), '{}') as attendees
    from room_bookings b join rooms r on r.id = b.room_id join floors f on f.id = r.floor_id join offices o on o.id = f.office_id
    where b.id = any(${ids as string[]}::bigint[])
    order by lower(b.during), b.id`;
  return rows.map(b => ({
    key: roomKey(String(b.id)),
    calendarKey: calendarKeyOf(String(b.id), b.uid_salt),
    members: [...new Set([b.member_id, ...b.attendees])].filter(m => m.startsWith("mbr_")),
    organiser: b.member_id,
    attendees: b.attendees,
    title: inAll(t => bounded(b.title || format(t.calendar.roomBooked, { room: b.room }), 120)),
    description: inAll(t => format(t.calendar.roomDescription, { room: b.room })),
    location: place(b.room, b.floor, b.office, b.address),
    path: `/chest/rooms?day=${b.day}&booking=${b.id}`,
    busy: true,
    start: new Date(b.start),
    end: new Date(b.end),
    stamp: new Date(b.changed_at),
    sequence: Number(b.revision),
    lastDay: b.day,
    cancelled: b.cancelled === true,
  }));
}

// eventOf reads what a key should be in the calendars now: null when it
// should not be there (cancelled, not at the office, nobody left, over for
// a month).
export async function eventOf(sql: Query, key: string, zone: string, now = new Date()): Promise<Event | null> {
  const oldest = addDays(today(zone, now), -keepDays);
  const room = /^room:([1-9][0-9]{0,17})$/u.exec(key);
  if (room) {
    const [e] = await roomEvents(sql, [room[1]!]);
    if (!e || e.cancelled || e.lastDay < oldest || e.members.length === 0) return null;
    const { cancelled: _c, organiser: _o, attendees: _a, ...event } = e;
    return event;
  }
  const day = /^day:(mbr_[a-z2-7]{26}):(\d{4}-\d{2}-\d{2})$/u.exec(key);
  if (day) {
    const [member, d] = [day[1]!, day[2]!];
    if (d < oldest) return null;
    const [said] = await sql<{ status: string; office: string | null; address: string | null }[]>`
      select p.status, o.name as office, o.address from presence p left join offices o on o.id = p.office_id where p.member_id = ${member} and p.day = ${d}`;
    if (said && said.status !== "office") return null;
    const desks = await sql<{ desk: string; part: "day" | "am" | "pm"; office: string; address: string; created_at: Date }[]>`
      select d.name as desk, b.part, o.name as office, o.address, b.created_at
      from desk_bookings b join desks d on d.id = b.desk_id join areas a on a.id = d.area_id join floors f on f.id = a.floor_id join offices o on o.id = f.office_id
      where b.member_id = ${member} and b.day = ${d} and b.cancelled_at is null and d.archived_at is null
      order by lower(b.during)`;
    if (!said && desks.length === 0) return null;
    // When the day last changed (said, a desk taken or freed): its stamp,
    // and its sequence (seconds since 2026), so a calendar that has the
    // event takes the newer one.
    const [{ at } = { at: null }] = await sql<{ at: Date | null }[]>`
      select greatest((select changed_at from presence where member_id = ${member} and day = ${d}),
        (select max(coalesce(cancelled_at, created_at)) from desk_bookings where member_id = ${member} and day = ${d})) as at`;
    const changed = at ? new Date(at).getTime() : Date.parse(d + "T00:00:00Z");
    const office = desks[0]?.office ?? said?.office ?? null;
    const address = desks[0]?.address ?? said?.address ?? null;
    return {
      key,
      calendarKey: key,
      members: [member],
      title: inAll(t => desks.length === 0
        ? t.calendar.office
        : format(t.calendar.officeDesk, { desk: desks.map(x => x.part === "day" ? x.desk : `${x.desk} (${t.parts[x.part].toLowerCase()})`).join(", ") })),
      ...(office ? { location: place(office, address) } : {}),
      path: `/chest?day=${d}`,
      busy: false,
      days: { first: d, last: d },
      stamp: new Date(changed),
      sequence: Math.max(0, Math.floor((changed - Date.UTC(2026, 0, 1)) / 1000)),
      lastDay: d,
    };
  }
  return null;
}

// flush sends the queued keys to the Chest, the oldest first, at most
// limit of them: the events to put in one putMany, then the removals. Never throws for the Chest: a courtesy to the member, the
// tool's pages stay the truth.
export async function flush(sql: Sql, zone: string, limit = 40): Promise<void> {
  const [s] = await sql<{ calendar: State; waiting: boolean }[]>`
    select calendar, (calendar = 'off' and calendar_tried > now() - interval '1 hour') as waiting from settings`;
  if (!s || s.waiting) return;
  // What is over for a month leaves the calendars.
  const oldest = addDays(today(zone), -keepDays);
  await sql`insert into calendar_queue (key) select key from calendar_sent where last_day < ${oldest} order by last_day limit ${limit} on conflict do nothing`;
  // queued_at in microseconds, as text: a JavaScript date would lose them.
  const queued = await sql<{ key: string; stamp: string }[]>`
    select key, (extract(epoch from queued_at) * 1000000)::bigint::text as stamp from calendar_queue order by queued_at, key limit ${limit}`;
  if (queued.length === 0) return;
  let worked = false;
  // Queued again meanwhile: it stays for the next flush.
  const done = (q: { key: string; stamp: string }) => sql`delete from calendar_queue where key = ${q.key} and (extract(epoch from queued_at) * 1000000)::bigint <= ${q.stamp}::bigint`;
  const sent = (key: string, lastDay: string, published: string) => sql`
    insert into calendar_sent (key, last_day, published) values (${key}, ${lastDay}, ${published === key ? null : published})
    on conflict (key) do update set last_day = excluded.last_day, published = excluded.published`;
  // Refused for good (too far ahead, long past): nothing to retry.
  const refusedForGood = (error: unknown) => error instanceof ChestError && (error.code === "invalid_event" || error.code === "invalid_key" || error.code === "invalid_id");
  const puts: { q: { key: string; stamp: string }; event: calendar.CalendarEvent; lastDay: string }[] = [];
  const removals: { key: string; stamp: string }[] = [];
  for (const q of queued) {
    const e = await eventOf(sql, q.key, zone);
    if (e) {
      const { stamp: _stamp, sequence: _sequence, lastDay, key: _key, calendarKey, ...event } = e;
      puts.push({ q, event: { ...event, key: calendarKey }, lastDay });
    } else removals.push(q);
  }
  // The events to put go together (calendar.putMany, studio.15: one write
  // of the minute for up to 100). The Chest answers each (studio.16): one
  // it took is remembered as sent; one it refuses for good (too far ahead,
  // long past) leaves the queue without being remembered as sent; one
  // refused because the Chest is full waits in the queue.
  let stop = false;
  if (puts.length > 0) {
    let results: calendar.PutResult[] = [];
    try {
      results = await calendar.putMany(puts.map(p => p.event));
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await sql`update settings set calendar = 'off', calendar_tried = now()`;
        return;
      }
      if (!(error instanceof ChestError)) throw error;
      stop = true; // unreachable, rate limited: later
    }
    for (const r of results) {
      const p = puts[r.index]!;
      if (r.ok) {
        await sent(p.q.key, p.lastDay, p.event.key);
        await done(p.q);
        worked = true;
      } else if (r.reason !== "quota_exceeded") {
        // Full: it waits (the removals below still go). Anything else is
        // refused for good: nothing to retry.
        await done(p.q);
      }
    }
  }
  for (const q of stop ? [] : removals) {
    try {
      // The event as the Chest was given it (the booking may be gone).
      const [held] = await sql<{ published: string | null }[]>`select published from calendar_sent where key = ${q.key}`;
      await calendar.remove(held?.published ?? q.key);
      await sql`delete from calendar_sent where key = ${q.key}`;
      worked = true;
    } catch (error) {
      if (error instanceof CapabilityNotGranted) {
        await sql`update settings set calendar = 'off', calendar_tried = now()`;
        return;
      }
      if (!refusedForGood(error)) {
        if (error instanceof ChestError) break; // unreachable, rate limited: later
        throw error;
      }
    }
    await done(q);
  }
  if (worked && s.calendar !== "on") await sql`update settings set calendar = 'on', calendar_tried = now()`;
}

// A file of events to open in any calendar app ("Add to my calendar"): in
// one language, each with the UID the Chest's feed gives it, so a calendar
// that has both sees one event.
export function icsFile(events: (Event & { cancelled?: boolean })[], locale: Locale, options: { domain: string; origin: string | null; name?: string; method?: "PUBLISH" | "CANCEL" }): string {
  return calendar.ics(events.map(e => ({
    uid: calendar.uidOf("rooms", e.calendarKey, options.domain),
    stamp: e.stamp,
    sequence: e.sequence,
    title: calendar.pick(e.title, locale),
    ...(e.description ? { description: calendar.pick(e.description, locale) } : {}),
    ...(e.location ? { location: e.location } : {}),
    ...(options.origin ? { url: options.origin + e.path } : {}),
    busy: e.busy,
    ...(e.cancelled ? { cancelled: true } : {}),
    ...("days" in e ? { days: e.days } : { start: e.start, end: e.end }),
  })), { method: options.method ?? "PUBLISH", ...(options.name ? { name: options.name } : {}) });
}
