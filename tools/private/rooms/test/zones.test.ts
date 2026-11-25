import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as places from "../src/lib/places.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import * as desks from "../src/lib/desk-bookings.ts";
import { deskZone, officeZone, roomZone, zone as chestZone } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";
import { addDays, nextWorkingDay, partMinutes } from "../src/shared/model.ts";

// SDK 0.7.0: the Chest's zone is the company's, set on no screen. An
// office in another city keeps its own clock (offices.time_zone, chosen in
// Places): its rooms' hours and its desks' days are read there; an office
// without one keeps the Chest's.

let database: TestDatabase;
let chest: FakeChest;
let paris: Awaited<ReturnType<typeof office>>;
let york: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase({ timeZone: zone });
  chest = await fakeChest({ members: everyone, chest: { timeZone: zone } });
  paris = await office(database.sql, "Paris");
  york = await office(database.sql, "New York");
});
after(async () => {
  await chest.close();
  await database.close();
});

const instants = async (id: string) => {
  const [r] = await database.sql<{ start: Date }[]>`select lower(during) as start from room_bookings where id = ${id}`;
  return r!.start;
};
const hourIn = (at: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

test("an office without a zone of its own keeps the Chest's", async () => {
  assert.equal(chestZone(), zone);
  assert.equal(await officeZone(database.sql, paris.office), zone);
  assert.equal(await roomZone(database.sql, paris.atlas), zone);
  assert.equal(await deskZone(database.sql, paris.desks[0]!), zone);
  assert.equal(await officeZone(database.sql, null), zone);
});

test("an admin gives an office its zone: only a zone the server knows; anyone else is refused", async () => {
  const { sql } = database;
  await assert.rejects(places.updateOffice(sql, asMember(hugo), york.office, { name: "New York", address: "", timeZone: "America/New_York" }), { code: "forbidden" });
  await assert.rejects(places.updateOffice(sql, asMember(camille), york.office, { name: "New York", address: "", timeZone: "Mars/Olympus" }), { code: "invalid" });
  await assert.rejects(places.updateOffice(sql, asMember(camille), york.office, { name: "New York", address: "", timeZone: "'; drop table offices; --" }), { code: "invalid" });
  await places.updateOffice(sql, asMember(camille), york.office, { name: "New York", address: "", timeZone: "America/New_York" });
  assert.equal(await officeZone(sql, york.office), "America/New_York");
  assert.equal(await roomZone(sql, york.atlas), "America/New_York");
  assert.equal(await deskZone(sql, york.desks[0]!), "America/New_York");
  // Left out, the zone stays; the name changes alone.
  await places.updateOffice(sql, asMember(camille), york.office, { name: "NYC", address: "" });
  assert.equal(await officeZone(sql, york.office), "America/New_York");
  assert.ok(places.zoneNames().includes("America/New_York") && places.zoneNames()[0] === "UTC");
  const listed = await places.offices(sql, asMember(hugo));
  assert.equal(listed.find(o => o.id === york.office)?.timeZone, "America/New_York");
  assert.equal(listed.find(o => o.id === paris.office)?.timeZone, null);
});

test("9:00 in a room of each office is 9:00 on that office's clock, and reads back as 9:00", async () => {
  const { sql } = database;
  const d = workday(3);
  const inParis = await rooms.bookRoom(sql, asMember(hugo), { roomId: paris.bora, day: d, start: 540, end: 600, title: "Paris" }, zone);
  const inYork = await rooms.bookRoom(sql, asMember(hugo), { roomId: york.bora, day: d, start: 540, end: 600, title: "York" }, zone);
  assert.equal(hourIn(await instants(inParis.bookings[0]!.id), "Europe/Paris"), "09:00");
  assert.equal(hourIn(await instants(inYork.bookings[0]!.id), "America/New_York"), "09:00");
  assert.equal(inYork.bookings[0]!.start, 540);
  const day = await rooms.roomDay(sql, asMember(hugo), york.office, d, zone);
  assert.deepEqual(day.map(b => [b.title, b.start, b.end]), [["York", 540, 600]]);
  const mine = await rooms.myRoomBookings(sql, asMember(hugo), d, d, zone);
  assert.deepEqual(mine.map(b => [b.title, b.start]).sort(), [["Paris", 540], ["York", 540]]);
  // The same hours, six hours apart: no clash for Hugo's desks either.
  await desks.bookDesk(sql, asMember(hugo), { deskId: paris.desks[0], day: d, part: "am" }, zone);
  await desks.bookDesk(sql, asMember(hugo), { deskId: york.desks[0], day: d, part: "pm" }, zone);
});

test("an office that changes its zone keeps its coming bookings at the same time on its clock", async () => {
  const { sql } = database;
  // The working day after the previous test's (workday(4) is the same
  // Monday as workday(3) when today is a Wednesday).
  const d = nextWorkingDay(addDays(workday(3), 1), [1, 2, 3, 4, 5]);
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: york.atlas, day: d, start: 600, end: 660, title: "Kept" }, zone);
  // A morning and an afternoon of one person: moved three hours, the
  // morning lands on the afternoon's old place — not a clash.
  await desks.bookDesk(sql, asMember(hugo), { deskId: york.desks[1], day: d, part: "am" }, zone);
  await desks.bookDesk(sql, asMember(hugo), { deskId: york.desks[2], day: d, part: "pm" }, zone);
  await places.updateOffice(sql, asMember(camille), york.office, { name: "NYC", address: "", timeZone: "America/Los_Angeles" });
  const at = await instants(bookings[0]!.id);
  assert.equal(hourIn(at, "America/Los_Angeles"), "10:00");
  const [again] = await rooms.byIds(sql, [bookings[0]!.id], zone);
  assert.deepEqual([again!.start, again!.end], [600, 660]);
  // Back to the company's: 10:00 in Paris.
  await places.updateOffice(sql, asMember(camille), york.office, { name: "NYC", address: "", timeZone: null });
  assert.equal(hourIn(await instants(bookings[0]!.id), "Europe/Paris"), "10:00");
  assert.equal(await officeZone(sql, york.office), zone);
  const parts = await sql<{ part: string; start: string }[]>`
    select part, to_char(lower(during) at time zone 'Europe/Paris', 'HH24:MI') as start from desk_bookings
    where member_id = ${hugo.id} and day = ${d} and cancelled_at is null order by 2`;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  assert.deepEqual(parts.map(p => [p.part, p.start]), [["am", hhmm(partMinutes.am[0])], ["pm", hhmm(partMinutes.pm[0])]]);
});

test("a zone that would make one person's two desks overlap is refused, and nothing moves", async () => {
  const { sql } = database;
  const d = workday(15);
  // Hugo (booked for by an admin, three weeks ahead): a Paris desk in the
  // morning, a New York one in the afternoon (on
  // New York's clock: 13:00 there is 19:00 in Paris — apart).
  await desks.bookDesk(sql, asMember(camille), { deskId: paris.desks[1], day: d, part: "am", for: hugo.id }, zone);
  await places.updateOffice(sql, asMember(camille), york.office, { name: "NYC", address: "", timeZone: "America/New_York" });
  await desks.bookDesk(sql, asMember(camille), { deskId: york.desks[3], day: d, part: "pm", for: hugo.id }, zone);
  // New York's afternoon on Tokyo's clock is Paris's early morning: the two overlap.
  await assert.rejects(places.updateOffice(sql, asMember(camille), york.office, { name: "NYC", address: "", timeZone: "Asia/Tokyo" }), { code: "zone_clash" });
  assert.equal(await officeZone(sql, york.office), "America/New_York");
});

// The pages follow the Chest's realtime (src/islands/Live.tsx): every feed
// of chest.json is a table of the schema, its columns its primary key —
// the rows' keys only, never what they hold (a visit, a leave).
test("every realtime feed names a table of the schema and only its primary key", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { realtime: { channels: { name: string }[]; feeds: { table: string; channel: string; columns: string[] }[] } };
  assert.deepEqual(manifest.realtime.channels.map(c => c.name), ["office"]);
  for (const feed of manifest.realtime.feeds) {
    const key = await database.sql<{ column: string }[]>`
      select a.attname as column from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ${feed.table}::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`;
    assert.deepEqual(feed.columns, key.map(k => k.column), feed.table);
    assert.equal(feed.channel, "office");
  }
});
