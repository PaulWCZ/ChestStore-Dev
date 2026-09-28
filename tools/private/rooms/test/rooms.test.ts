import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import { addDays, today, weekday } from "../lib/model.ts";
import * as rooms from "../lib/room-bookings.ts";
import { setRules } from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora } from "./support/members.ts";
import { office, weekend, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

test("a member books a slot with a title and people; the day's grid shows it; the slot cannot be booked twice", async () => {
  const { sql } = database;
  const d = workday(1);
  const { bookings, taken } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: d, start: 600, end: 690, title: "  Weekly   sync ", attendees: [ines.id, lea.id, hugo.id] }, zone);
  assert.deepEqual(taken, []);
  const b = bookings[0]!;
  assert.deepEqual([b.roomName, b.day, b.start, b.end, b.title, b.memberId, b.attendees, b.series], ["Atlas", d, 600, 690, "Weekly sync", hugo.id, [ines.id, lea.id].sort(), null]);
  assert.deepEqual((await rooms.roomDay(sql, asMember(lea), o.office, d, zone)).map(x => x.id), [b.id]);
  await assert.rejects(rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: d, start: 675, end: 720 }, zone), { code: "taken" });
  // Back to back is fine; another room at the same time too.
  await rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: d, start: 690, end: 720 }, zone);
  await rooms.bookRoom(sql, asMember(ines), { roomId: o.bora, day: d, start: 600, end: 690 }, zone);
  assert.deepEqual((await rooms.myRoomBookings(sql, asMember(lea), d, d, zone)).map(x => x.id), [b.id]);
});

test("refusals: outside the hours, not on a quarter, end before start, the past, too far, a closed day, no role", async () => {
  const { sql } = database;
  const d = workday(1);
  const book = (who: typeof hugo, input: Record<string, unknown>) => rooms.bookRoom(sql, asMember(who), { roomId: o.bora, day: d, start: 840, end: 900, ...input }, zone);
  await assert.rejects(book(hugo, { start: 360, end: 420 }), { code: "outside_hours" });
  await assert.rejects(book(hugo, { start: 1170, end: 1215 }), { code: "outside_hours" });
  await assert.rejects(book(hugo, { start: 610, end: 660 }), { code: "invalid" });
  await assert.rejects(book(hugo, { start: 900, end: 840 }), { code: "outside_hours" });
  await assert.rejects(book(hugo, { day: addDays(today(zone), -3) }), { code: "past" });
  await assert.rejects(book(hugo, { day: workday(20) }), { code: "too_far" });
  await assert.rejects(book(hugo, { day: weekend() }), { code: "closed_day" });
  await assert.rejects(book(hugo, { title: "x".repeat(121) }), { code: "too_long" });
  await assert.rejects(book(hugo, { attendees: ["someone"] }), { code: "invalid" });
  await assert.rejects(book(hugo, { weeks: 13 }), { code: "invalid" });
  await assert.rejects(book(nora, {}), { code: "forbidden" });
  await assert.rejects(book(hugo, { roomId: "31337" }), { code: "not_found" });
});

test("weekly: each occurrence is a booking; those already taken are skipped and named; cancelled one by one or from one on", async () => {
  const { sql } = database;
  const first = workday(2);
  await rooms.bookRoom(sql, asMember(lea), { roomId: o.bora, day: addDays(first, 7), start: 480, end: 510 }, zone);
  const done = await rooms.bookRoom(sql, asMember(camille), { roomId: o.bora, day: first, start: 480, end: 540, title: "Stand-up", attendees: [hugo.id], weeks: 4 }, zone);
  assert.deepEqual(done.taken, [addDays(first, 7)]);
  assert.deepEqual(done.bookings.map(b => b.day), [first, addDays(first, 14), addDays(first, 21)]);
  assert.ok(done.bookings.every(b => b.series === done.bookings[0]!.series && b.series !== null));
  const [one] = await rooms.cancelRoomBooking(sql, asMember(camille), done.bookings[0]!.id, "one", zone);
  assert.equal(one!.id, done.bookings[0]!.id);
  const rest = await rooms.cancelRoomBooking(sql, asMember(camille), done.bookings[1]!.id, "following", zone);
  assert.deepEqual(rest.map(b => b.day), [addDays(first, 14), addDays(first, 21)]);
  // Undo: all back, or nothing.
  await rooms.restoreRoomBookings(sql, asMember(camille), rest.map(b => b.id), zone);
  assert.equal((await rooms.myRoomBookings(sql, asMember(hugo), first, addDays(first, 30), zone)).length, 2);
  await assert.rejects(rooms.bookRoom(sql, asMember(hugo), { roomId: o.bora, day: addDays(first, 7), start: 480, end: 510, weeks: 1 }, zone), { code: "taken" });
});

test("change and cancel: the organiser or an admin; a new time that is taken is refused; people follow", async () => {
  const { sql } = database;
  const d = workday(3);
  const { bookings: [b] } = await rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: d, start: 540, end: 600, attendees: [hugo.id] }, zone);
  await rooms.bookRoom(sql, asMember(lea), { roomId: o.atlas, day: d, start: 660, end: 720 }, zone);
  await assert.rejects(rooms.updateRoomBooking(sql, asMember(hugo), b!.id, { start: 570, end: 630 }, zone), { code: "forbidden" });
  await assert.rejects(rooms.updateRoomBooking(sql, asMember(ines), b!.id, { start: 630, end: 690 }, zone), { code: "taken" });
  const { before, after } = await rooms.updateRoomBooking(sql, asMember(ines), b!.id, { start: 570, end: 630, title: "Budget", attendees: [lea.id] }, zone);
  assert.deepEqual([before.start, after.start, after.end, after.title, after.attendees], [540, 570, 630, "Budget", [lea.id]]);
  const moved = await rooms.updateRoomBooking(sql, asMember(camille), b!.id, { roomId: o.bora, day: workday(4) }, zone);
  assert.deepEqual([moved.after.roomName, moved.after.start], ["Bora", 570]);
  await assert.rejects(rooms.cancelRoomBooking(sql, asMember(hugo), b!.id, "one", zone), { code: "forbidden" });
  const [gone] = await rooms.cancelRoomBooking(sql, asMember(camille), b!.id, "one", zone);
  assert.equal(gone!.memberId, ines.id);
  await assert.rejects(rooms.restoreRoomBookings(sql, asMember(ines), [b!.id], zone), { code: "forbidden" });
  await assert.rejects(rooms.cancelRoomBooking(sql, asMember(ines), b!.id, "one", zone), { code: "not_found" });
});

test("daylight saving: a booking on the night the clocks change keeps its hours; a desk day lasts that day's length", async () => {
  const { sql } = database;
  await setRules(sql, asMember(camille), { weekdays: [1, 2, 3, 4, 5, 6, 7] });
  try {
    // The next last Sunday of March or October.
    let d = addDays(today(zone), 1);
    while (!(weekday(d) === 7 && ["03", "10"].includes(d.slice(5, 7)) && Number(d.slice(8)) > 24)) d = addDays(d, 1);
    const { bookings: [b] } = await rooms.bookRoom(sql, asMember(camille), { roomId: o.atlas, day: d, start: 600, end: 660 }, zone);
    assert.deepEqual([b!.start, b!.end], [600, 660]);
    const [row] = await sql<{ utc: string; hours: number }[]>`select to_char(lower(during) at time zone 'UTC', 'HH24:MI') as utc, extract(epoch from upper(during) - lower(during)) / 3600 as hours from room_bookings where id = ${b!.id}`;
    // 10:00 in Paris is 08:00 UTC in summer time, 09:00 in winter time: after the change, winter (October) or summer (March).
    assert.equal(row!.utc, d.slice(5, 7) === "10" ? "09:00" : "08:00");
    assert.equal(Number(row!.hours), 1);
    const desk = await desks.bookDesk(sql, asMember(camille), { deskId: o.desks[0], day: d }, zone);
    const [length] = await sql<{ hours: number }[]>`select extract(epoch from upper(during) - lower(during)) / 3600 as hours from desk_bookings where id = ${desk.id}`;
    assert.equal(Number(length!.hours), d.slice(5, 7) === "10" ? 25 : 23);
  } finally {
    await setRules(sql, asMember(camille), { weekdays: [1, 2, 3, 4, 5] });
  }
});
