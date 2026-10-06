import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { importRoomCalendar, undoCalendarImport } from "../src/lib/calendar-import.ts";
import { readEvents } from "../src/lib/ical.ts";
import { addDays, weekday } from "../src/shared/model.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const admin = asMember(camille);
const people = everyone.filter(p => p.role !== null).map(p => ({ id: p.id, name: p.name }));

// The Monday of a week at least a week ahead, and the days after it.
function nextMonday(): string {
  let d = workday(7);
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}
const stamp = (day: string, time: string) => day.replaceAll("-", "") + "T" + time.replace(":", "") + "00";

// A room calendar as Google Calendar exports it: a Paris VTIMEZONE, the
// calendar's name, events folded at 75 characters.
function calendar(monday: string, extra = ""): string {
  const wed = addDays(monday, 2), tue = addDays(monday, 1), thu = addDays(monday, 3);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "X-WR-CALNAME:Paris-1-Atlas (8)",
    "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE",
    // A weekly stand-up, every Monday 09:30–10:00, ten times; the third is
    // taken out; Hugo organises it, Inès is invited, the room is a resource.
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(monday, "09:30")}`, `DTEND;TZID=Europe/Paris:${stamp(monday, "10:00")}`,
    "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10", `EXDATE;TZID=Europe/Paris:${stamp(addDays(monday, 14), "09:30")}`,
    "UID:standup@google.com", "SUMMARY:Sales stand-up\\, weekly", "ORGANIZER;CN=Hugo Bernard:mailto:hugo@atelier-martin.test",
    "ATTENDEE;CUTYPE=INDIVIDUAL;CN=Inès Moreau:mailto:ines@atelier-martin.test",
    "ATTENDEE;CUTYPE=RESOURCE;CN=Paris-1-Atlas (8):mailto:c_188@resource.calendar.google.com",
    "END:VEVENT",
    // Its fourth Monday moved to the Tuesday, 14:00.
    "BEGIN:VEVENT", `RECURRENCE-ID;TZID=Europe/Paris:${stamp(addDays(monday, 21), "09:30")}`,
    `DTSTART;TZID=Europe/Paris:${stamp(addDays(monday, 22), "14:00")}`, `DTEND;TZID=Europe/Paris:${stamp(addDays(monday, 22), "14:30")}`,
    "UID:standup@google.com", "SUMMARY:Sales stand-up (moved)", "END:VEVENT",
    // A one-off, folded over two lines, organised by someone not in the Chest.
    "BEGIN:VEVENT", `DTSTART:${stamp(wed, "12:50")}Z`, `DTEND:${stamp(wed, "14:00")}Z`, "UID:client@google.com",
    "SUMMARY:Client visit with the whole team of Atelier Martin and our friends", " from Lyon", "ORGANIZER;CN=Someone Outside:mailto:x@example.com", "END:VEVENT",
    // All day, too early, cancelled: left out.
    "BEGIN:VEVENT", `DTSTART;VALUE=DATE:${tue.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${addDays(tue, 1).replaceAll("-", "")}`, "UID:allday@google.com", "SUMMARY:Painting", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(thu, "06:00")}`, `DTEND;TZID=Europe/Paris:${stamp(thu, "06:30")}`, "UID:early@google.com", "SUMMARY:Cleaning", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(thu, "11:00")}`, `DTEND;TZID=Europe/Paris:${stamp(thu, "12:00")}`, "UID:gone@google.com", "STATUS:CANCELLED", "SUMMARY:Gone", "END:VEVENT",
    // Every other Thursday: not a weekly booking, its days one by one.
    "BEGIN:VEVENT", `DTSTART;TZID=Europe/Paris:${stamp(thu, "16:00")}`, `DTEND;TZID=Europe/Paris:${stamp(thu, "17:00")}`, "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3", "UID:review@google.com", "SUMMARY:Review", "END:VEVENT",
    // Long past: never read.
    "BEGIN:VEVENT", "DTSTART:20200106T090000Z", "DTEND:20200106T100000Z", "UID:old@google.com", "SUMMARY:Old", "END:VEVENT",
    extra,
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

test("the reader: a weekly series with its exception and moved day, texts unescaped and unfolded, people by name, resources left out", () => {
  const monday = nextMonday();
  const now = Date.now();
  const { events, cancelled } = readEvents(calendar(monday), { from: now, to: now + 400 * 86400000, zone });
  assert.equal(cancelled, 1);
  const standup = events.find(e => e.title === "Sales stand-up, weekly")!;
  assert.equal(standup.weekly, true);
  assert.equal(standup.occurrences.length, 8, "ten, less the one taken out and the one moved");
  assert.deepEqual(standup.organizer, { name: "Hugo Bernard", address: "hugo@atelier-martin.test" });
  assert.deepEqual(standup.attendees, [{ name: "Inès Moreau", address: "ines@atelier-martin.test" }]);
  assert.ok(standup.line > 1);
  const moved = events.find(e => e.title === "Sales stand-up (moved)")!;
  assert.equal(moved.weekly, false);
  assert.equal(events.find(e => e.uid === "client@google.com")!.title, "Client visit with the whole team of Atelier Martin and our friendsfrom Lyon");
  const review = events.find(e => e.title === "Review")!;
  assert.deepEqual([review.weekly, review.repeats, review.occurrences.length], [false, true, 3]);
  assert.ok(!events.some(e => e.title === "Old"));
  assert.throws(() => readEvents("not a calendar", { from: now, to: now + 1, zone }));
});

test("preview writes nothing; the import recreates the weekly series, flags each conflict and each event left out, line by line; again adds nothing; Undo takes it all back", async () => {
  const { sql } = database;
  const o = await office(sql, "Lyon");
  const monday = nextMonday();
  // Rooms already has Atlas on the stand-up's second Monday at 09:45.
  await rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: addDays(monday, 7), start: 585, end: 615, title: "Already here" }, zone).catch(async () => {
    // Beyond the member's window: booked by the admin instead.
    await rooms.bookRoom(sql, admin, { roomId: o.atlas, day: addDays(monday, 7), start: 585, end: 615, title: "Already here" }, zone);
  });
  const text = calendar(monday);
  const count = async () => Number((await sql<{ n: number }[]>`select count(*)::int as n from room_bookings where cancelled_at is null`)[0]!.n);
  const before = await count();

  const preview = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: false }, people, zone);
  assert.equal(preview.batch, null);
  assert.equal(await count(), before, "a preview writes nothing");

  const done = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: true }, people, zone);
  assert.deepEqual({ ...done, batch: null }, { ...preview, batch: null }, "the preview said exactly what the import did");
  assert.ok(done.batch);
  const standup = done.items.find(i => i.title === "Sales stand-up, weekly")!;
  assert.equal(standup.weekly, true);
  assert.equal(standup.count, 7, "eight Mondays, one taken in Rooms");
  assert.deepEqual(standup.taken, [addDays(monday, 7)]);
  assert.equal(standup.organiser, hugo.id);
  assert.deepEqual([standup.day, standup.start, standup.end], [monday, 570, 600]);
  const client = done.items.find(i => i.title.startsWith("Client visit"))!;
  assert.equal(client.organiser, null, "nobody by that name: the admin's booking");
  assert.equal(client.organiserText, "Someone Outside");
  // In the admin's name: the client visit and the three reviews (no organiser).
  assert.equal(done.yours, 1 + 3 + 1, "the client visit, the three reviews and the moved stand-up name no organiser anyone matches");
  assert.deepEqual(done.leftOut.map(l => l.reason).sort(), ["all_day", "outside_hours"]);
  assert.ok(done.leftOut.every(l => l.line > 0 && l.day));
  assert.equal(done.items.find(i => i.title === "Review")!.count, 3);
  assert.equal(done.cancelled, 1);
  assert.equal(done.added, 7 + 1 + 1 + 3);

  const rows = await sql<{ series: string | null; member_id: string; attendees: string[] }[]>`
    select b.series, b.member_id, coalesce((select array_agg(a.member_id) from room_attendees a where a.booking_id = b.id), '{}') as attendees
    from room_bookings b where b.title = 'Sales stand-up, weekly' and b.cancelled_at is null`;
  assert.equal(new Set(rows.map(r => r.series)).size, 1, "one weekly series");
  assert.ok(rows[0]!.series);
  assert.ok(rows.every(r => r.member_id === hugo.id && r.attendees.includes(ines.id)));
  const clientRow = (await sql<{ start: number; end: number }[]>`
    select (extract(epoch from (lower(during) at time zone ${zone}) - day::timestamp) / 60)::int as start,
           (extract(epoch from (upper(during) at time zone ${zone}) - day::timestamp) / 60)::int as "end"
    from room_bookings where title like 'Client visit%'`)[0]!;
  assert.ok(clientRow.start % 15 === 0 && clientRow.end % 15 === 0, "quarter hours, the room held from the quarter before");

  // The same file again: nothing new, each event said to be there already.
  const again = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: true }, people, zone);
  assert.equal(again.added, 0);
  assert.ok(again.leftOut.filter(l => l.reason === "exists").length >= 3);

  // Undo: the whole import goes.
  assert.equal(await undoCalendarImport(sql, admin, done.batch), 12);
  assert.equal(await count(), before);
  await assert.rejects(undoCalendarImport(sql, admin, done.batch), { code: "not_found" });
});

test("only admins import; a file that is not a calendar, or an unknown room, is refused", async () => {
  const { sql } = database;
  const o = await office(sql, "Nantes");
  await assert.rejects(importRoomCalendar(sql, asMember(hugo), { roomId: o.atlas, text: calendar(nextMonday()), commit: false }, people, zone), { code: "forbidden" });
  await assert.rejects(importRoomCalendar(sql, admin, { roomId: o.atlas, text: "Name,Seats\nAtlas,8", commit: false }, people, zone), { code: "invalid" });
  await assert.rejects(importRoomCalendar(sql, admin, { roomId: "999999", text: calendar(nextMonday()), commit: false }, people, zone), { code: "not_found" });
  await assert.rejects(importRoomCalendar(sql, admin, { roomId: o.atlas, text: "", commit: false }, people, zone), { code: "empty" });
  await assert.rejects(undoCalendarImport(sql, asMember(hugo), "1"), { code: "forbidden" });
});

// Outlook in an Exchange company: the organiser as "Last, First", guests
// by address only, a department in brackets; addresses matched when the
// Chest gives them (members.email).
test("Outlook's \"Martin, Camille\" and addresses find the people; the preview counts the bookings left in the admin's name and names the guests not found", async () => {
  const { sql } = database;
  const o = await office(sql, "Lille");
  const monday = nextMonday();
  const thu = addDays(monday, 3), fri = addDays(monday, 4);
  const withAddresses = everyone.filter(p => p.role !== null).map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, email: p.firstName.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() + "@example.test" }));
  const text = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:Microsoft Exchange Server 2010",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(thu, "10:00")}`, `DTEND;TZID=Romance Standard Time:${stamp(thu, "11:00")}`, "UID:outlook-1",
    "SUMMARY:Budget 2027", 'ORGANIZER;CN="Martin, Camille":mailto:someone-else@example.test',
    'ATTENDEE;ROLE=REQ-PARTICIPANT;CN="Martin, Camille":mailto:someone-else@example.test',
    "ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:hugo@example.test",
    'ATTENDEE;CN="Rossi, Sofia (Finance)":mailto:s.rossi@elsewhere.test',
    'ATTENDEE;CN="Durand, Paul":mailto:paul.durand@client.test',
    "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(fri, "10:00")}`, `DTEND;TZID=Romance Standard Time:${stamp(fri, "11:00")}`, "UID:outlook-2",
    "SUMMARY:Supplier call", "ORGANIZER:mailto:ines@example.test", "END:VEVENT",
    "BEGIN:VEVENT", `DTSTART;TZID=Romance Standard Time:${stamp(fri, "14:00")}`, `DTEND;TZID=Romance Standard Time:${stamp(fri, "15:00")}`, "UID:outlook-3",
    "SUMMARY:Visit", 'ORGANIZER;CN="Durand, Paul":mailto:paul.durand@client.test', "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  // With names only (no members.email): "Martin, Camille" and "Rossi,
  // Sofia (Finance)" are found by name; an address alone is not.
  const byName = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: false }, people.map(p => ({ ...p, ...splitName(p.name) })), zone);
  const budget = byName.items.find(i => i.title === "Budget 2027")!;
  assert.equal(budget.organiser, camille.id);
  assert.deepEqual(budget.unknownGuests.sort(), ["Durand, Paul", "hugo@example.test"]);
  assert.equal(byName.items.find(i => i.title === "Supplier call")!.organiser, null);
  assert.equal(byName.yours, 2, "the supplier call and the visit");
  assert.deepEqual(byName.unknownGuests.sort(), ["Durand, Paul", "hugo@example.test"]);

  // With addresses: Hugo and Inès by address, too.
  const done = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: true }, withAddresses, zone);
  assert.equal(done.items.find(i => i.title === "Supplier call")!.organiser, ines.id);
  assert.equal(done.yours, 1, "only the visit of someone outside the company");
  assert.deepEqual(done.unknownGuests, ["Durand, Paul"]);
  const [row] = await sql<{ member_id: string; attendees: string[] }[]>`
    select b.member_id, coalesce((select array_agg(a.member_id order by a.member_id) from room_attendees a where a.booking_id = b.id), '{}') as attendees
    from room_bookings b where b.title = 'Budget 2027' and b.cancelled_at is null`;
  assert.equal(row!.member_id, camille.id);
  assert.deepEqual(row!.attendees, [hugo.id, sofia.id].sort());
});

function splitName(name: string) {
  const [firstName, ...rest] = name.split(" ");
  return { firstName: firstName!, lastName: rest.join(" ") };
}

// The Outlook export of the docs' screenshot (test/fixtures/outlook-atlas.ics):
// the weekly series with "Martin, Camille" is hers; the supplier's is the admin's.
test("the Outlook fixture: “Martin, Camille” organises the weekly board, the supplier's meeting is counted in the admin's name", async () => {
  const { sql } = database;
  const o = await office(sql, "Rennes");
  const text = readFileSync(new URL("./fixtures/outlook-atlas.ics", import.meta.url), "utf8");
  const preview = await importRoomCalendar(sql, admin, { roomId: o.atlas, text, commit: false }, people.map(p => ({ ...p, ...splitName(p.name) })), zone);
  const board = preview.items.find(i => i.title === "Comité de direction")!;
  const supplier = preview.items.find(i => i.title === "Point fournisseur")!;
  assert.equal(board.organiser, camille.id);
  assert.equal(board.weekly, true);
  assert.equal(supplier.organiser, null);
  assert.equal(preview.yours, supplier.count);
  assert.deepEqual(preview.unknownGuests, ["hugo@example.test"], "an address alone, without members.email");
});
