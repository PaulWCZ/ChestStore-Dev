import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { conflict, span } from "./booking-rules.ts";
import { enqueue, roomKey } from "./calendar.ts";
import type { Sql } from "./db.ts";
import { NotACalendar, readEvents, type EventPerson } from "./ical.ts";
import { matcher, type Matchable } from "./match.ts";
import { addDays, id, limits, minutesNow, step, today, weekday } from "../shared/model.ts";
import { rules } from "./settings.ts";
import { wall } from "./wall-clock.ts";

// Switching day: the bookings a room already has in Google Calendar or
// Outlook, brought into Rooms from the room calendar's .ics export — so
// the recurring meetings are not retyped by hand, and both systems hold
// the same truth from the first day.
//
// One file, one room (a room calendar's export). Only what is still to
// come is read, up to a year ahead. A weekly series (every week, same
// weekday) becomes one weekly booking of Rooms (one series); other
// repeats (daily, every two weeks, monthly) their occurrences one by one.
// Nothing is refused silently: each event the import leaves out, and each
// day of a series that is already taken in Rooms, is said with its line in
// the file. Importing the same file again adds nothing (each occurrence
// keeps its UID and start: `source`). An admin reads a preview first
// (`commit: false`: the same work, rolled back — so the conflicts are the
// database's own, not guessed), then imports; Undo takes the whole import
// back (`undoCalendarImport`, by its batch).
//
// The organiser and guests are matched to the people who have Rooms by
// address (when the Chest gives addresses: "members.email") and by name,
// in the forms Google and Outlook write them ("Martin, Camille" too:
// lib/match.ts). A booking whose organiser nobody matches stays in the
// importing admin's name; the preview says how many, and which guests it
// did not find, before anything is imported.

export type ImportSkip = "taken" | "exists" | "all_day" | "outside_hours" | "closed_day" | "too_long";
export type ImportItem = {
  line: number;
  title: string;
  // First day and times, in the Chest's zone.
  day: string;
  start: number;
  end: number;
  // The days booked: 1, or the occurrences of a series.
  count: number;
  weekly: boolean;
  // The organiser matched to someone of the Chest, else null (the admin).
  organiser: string | null;
  organiserText: string | null;
  // Guests the file names that nobody in Rooms matches (not invited).
  unknownGuests: string[];
  // Days of this event left out because the room is taken then.
  taken: string[];
};
export type ImportLeftOut = { line: number; title: string; day: string; reason: ImportSkip };
export type CalendarImport = {
  batch: string | null;
  added: number;
  items: ImportItem[];
  leftOut: ImportLeftOut[];
  // Events the file lists as cancelled: never imported.
  cancelled: number;
  // Bookings that come in the importing admin's name: their organiser is
  // nobody in Rooms (or the file names none).
  yours: number;
  // Guests nobody in Rooms matches, each once (the first 20).
  unknownGuests: string[];
};

export const importLimits = { fileBytes: 4 << 20, bookings: 3000, weeksAhead: 52 } as const;

const sameAs = (a: EventPerson, b: EventPerson) =>
  (a.address !== null && a.address.toLowerCase() === b.address?.toLowerCase()) || (a.name !== null && a.name === b.name);
class Preview extends Error {
  readonly result: CalendarImport;
  constructor(result: CalendarImport) {
    super("preview");
    this.result = result;
  }
}

export async function importRoomCalendar(
  sql: Sql,
  actor: Member | null,
  input: { roomId: unknown; text: unknown; commit: boolean },
  people: readonly Matchable[],
  zone: string,
  at = new Date(),
): Promise<CalendarImport> {
  if (!actor || !can(actor, "places.manage")) throw new AppError("forbidden");
  const roomId = id(input.roomId);
  if (typeof input.text !== "string" || input.text.trim() === "") throw new AppError("empty");
  if (input.text.length > importLimits.fileBytes) throw new AppError("file_too_large");
  const who = matcher(people);
  const shown = (p: EventPerson | null) => (p ? p.name ?? p.address : null);
  const day0 = today(zone, at);
  const horizon = addDays(day0, 7 * importLimits.weeksAhead);
  let reading;
  try {
    reading = readEvents(input.text, { from: at.getTime(), to: new Date(horizon + "T23:59:59Z").getTime(), zone });
  } catch (error) {
    if (error instanceof NotACalendar) throw new AppError("invalid");
    throw error;
  }
  const work = async (): Promise<CalendarImport> => sql.begin(async tx => {
    const [room] = await tx<{ id: string }[]>`select id from rooms where id = ${roomId} and archived_at is null for update`;
    if (!room) throw new AppError("not_found");
    const r = await rules(tx);
    const nowMinutes = minutesNow(zone, at);
    const batch = input.commit ? String((await tx<{ n: string }[]>`select nextval('room_imports') as n`)[0]!.n) : null;
    const result: CalendarImport = { batch, added: 0, items: [], leftOut: [], cancelled: reading.cancelled, yours: 0, unknownGuests: [] };
    const unknown = new Set<string>();
    const known = new Set((await tx<{ source: string }[]>`select source from room_bookings where room_id = ${roomId} and source is not null and cancelled_at is null`).map(x => x.source));
    const newIds: string[] = [];
    for (const e of reading.events) {
      const title = [...e.title].slice(0, limits.title).join("");
      const first = wall(e.occurrences[0]!.start, zone);
      const leave = (reason: ImportSkip, d = first.date) => result.leftOut.push({ line: e.line, title, day: d, reason });
      if (e.allDay) { leave("all_day"); continue; }
      const organiser = who(e.organizer);
      const matched = e.attendees.map(a => ({ a, id: who(a) }));
      const guests = [...new Set(matched.map(x => x.id).filter((x): x is string => x !== null && x !== (organiser ?? actor.id)))].slice(0, limits.attendees);
      // The organiser is often listed among the guests too: not "not found".
      const missing = [...new Set(matched.filter(x => x.id === null && !(organiser === null && e.organizer && sameAs(x.a, e.organizer))).map(x => shown(x.a)!))];
      const series = e.weekly && e.occurrences.length > 1 ? String((await tx<{ n: string }[]>`select nextval('room_series') as n`)[0]!.n) : null;
      const item: ImportItem = { line: e.line, title, day: "", start: 0, end: 0, count: 0, weekly: series !== null, organiser, organiserText: shown(e.organizer), unknownGuests: missing, taken: [] };
      let exists = 0;
      for (const o of e.occurrences) {
        const s = wall(o.start, zone), en = wall(o.end, zone);
        // A booking of Rooms is one day, in quarter hours: a meeting at 9:50
        // holds the room from 9:45.
        const startMin = Math.floor(s.minutes / step) * step;
        const endMin = en.date === s.date ? Math.ceil(en.minutes / step) * step : en.date === addDays(s.date, 1) && en.minutes === 0 ? 1440 : -1;
        if (endMin < 0) { leave("too_long", s.date); continue; }
        if (known.has(o.key)) { exists++; continue; }
        if (s.date === day0 && startMin < Math.floor(nowMinutes / step) * step) continue;
        if (!r.weekdays.includes(weekday(s.date))) { leave("closed_day", s.date); continue; }
        if (startMin < r.dayStart || endMin > r.dayEnd || endMin <= startMin) { leave("outside_hours", s.date); continue; }
        if (result.added >= importLimits.bookings) throw new AppError("too_many", { max: importLimits.bookings });
        try {
          const row = await tx.savepoint(async sp => {
            const [x] = await sp<{ id: string }[]>`
              insert into room_bookings (room_id, member_id, title, day, during, series, source, import_batch)
              values (${roomId}, ${organiser ?? actor.id}, ${title}, ${s.date}, ${span(sp, s.date, startMin, endMin, zone)}, ${series}, ${o.key}, ${batch})
              returning id`;
            return x!;
          });
          for (const g of guests) await tx`insert into room_attendees (booking_id, member_id) values (${row.id}, ${g}) on conflict do nothing`;
          newIds.push(String(row.id));
          known.add(o.key);
          result.added++;
          if (item.count === 0) Object.assign(item, { day: s.date, start: startMin, end: endMin });
          item.count++;
        } catch (error) {
          if (!conflict(error)) throw error;
          if (!series) leave("taken", s.date);
          else item.taken.push(s.date);
        }
      }
      if (item.count > 0) {
        item.weekly = item.weekly && item.count > 1;
        result.items.push(item);
        if (organiser === null) result.yours += item.count;
        for (const g of missing) unknown.add(g);
      } else if (item.taken.length > 0) {
        // Every day of the series is taken: said as one line.
        leave("taken", item.taken[0]);
      }
      if (exists > 0 && item.count === 0 && item.taken.length === 0) leave("exists");
    }
    result.unknownGuests = [...unknown].slice(0, 20);
    if (!input.commit) throw new Preview(result);
    await enqueue(tx, newIds.map(roomKey));
    return result;
  });
  try {
    return await work();
  } catch (error) {
    if (error instanceof Preview) return error.result;
    throw error;
  }
}

// Undo of an import: its bookings go, as if never made (they were only
// just brought in; the calendars that had them are told).
export async function undoCalendarImport(sql: Sql, actor: Member | null, batch: unknown): Promise<number> {
  if (!actor || !can(actor, "places.manage")) throw new AppError("forbidden");
  const b = id(batch);
  return sql.begin(async tx => {
    const gone = await tx<{ id: string }[]>`delete from room_bookings where import_batch = ${b} returning id`;
    if (gone.length === 0) throw new AppError("not_found");
    await enqueue(tx, gone.map(g => roomKey(String(g.id))));
    return gone.length;
  });
}
