import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as calendar from "@argentic/chest-sdk/calendar";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { builtServer, type Handler } from "./support/server.ts";
import * as cal from "../src/lib/calendar.ts";
import * as desks from "../src/lib/desk-bookings.ts";
import { erase, leave } from "../src/lib/lifecycle.ts";
import { bookingIcs, myCsv, myIcs } from "../src/lib/mine.ts";
import { catalogue } from "../src/i18n/index.ts";
import { addDays, today } from "../src/shared/model.ts";
import { setPresence } from "../src/lib/presence.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
let POST: Handler;
before(async () => {
  POST = await builtServer();
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "calendar"], calendar: { domain: "atelier.test", toolTitle: "Rooms", company: "Atelier" } });
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
});

const origin = { domain: "rooms.atelier.test", origin: "https://rooms-chest.atelier.test" };
// The key the Chest knows a room booking by: room:<id>:<its salt>
// (migrations/0008), or room:<id> for a booking made before.
async function published(id: string): Promise<string> {
  const [row] = await database.sql<{ uid_salt: string | null }[]>`select uid_salt from room_bookings where id = ${id}`;
  return cal.calendarKeyOf(id, row?.uid_salt ?? null);
}

test("a room booking is in the organiser's and the guests' calendars, in each one's language; a move updates it; a cancel removes it", async () => {
  const { sql } = database;
  const d = workday(2);
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: d, start: 600, end: 660, title: "", attendees: [ines.id] }, zone);
  const key = await published(bookings[0]!.id);
  assert.match(key, new RegExp(`^room:${bookings[0]!.id}:[0-9a-f]{12}$`, "u"), "a key of its own, unique across a restored database");
  await cal.flush(sql, zone);
  const kept = chest.calendar.get(key);
  assert.ok(kept, "put");
  assert.deepEqual([...kept.members].sort(), [hugo.id, ines.id].sort());
  assert.deepEqual(kept.title, { en: "Room booked: Atlas", fr: "Salle réservée : Atlas" });
  assert.equal(kept.path, `/chest/rooms?day=${d}&booking=${bookings[0]!.id}`);
  assert.match(kept.location ?? "", /^Atlas · Ground floor · Paris · 12 rue de Paradis$/u);
  assert.ok("start" in kept && kept.start.endsWith("Z"));
  // Ines's feed says it in French.
  assert.match(chest.feed(ines.id), /SUMMARY:Salle réservée : Atlas/u);
  assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, 0);
  assert.equal((await cal.state(sql)), "on");

  // Moved an hour later, a guest added: the same event, updated.
  await rooms.updateRoomBooking(sql, asMember(hugo), bookings[0]!.id, { start: 660, end: 720, attendees: [ines.id, lea.id], title: "Budget" }, zone);
  await cal.flush(sql, zone);
  const moved = chest.calendar.get(key)!;
  assert.deepEqual([...moved.members].sort(), [hugo.id, ines.id, lea.id].sort());
  assert.equal(moved.title.en, "Budget");
  assert.ok(moved.sequence >= 1);
  assert.ok("start" in moved && "start" in kept && moved.start > kept.start);

  await rooms.cancelRoomBooking(sql, asMember(hugo), bookings[0]!.id, "one", zone);
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.has(key), false);
  assert.equal((await sql`select count(*)::int as n from calendar_sent where key = ${"room:" + bookings[0]!.id}`)[0]!.n, 0);
});

test("a booking made before the salt keeps the key calendars hold; two bookings of one id in two databases never share a UID", async () => {
  const { sql } = database;
  const d = workday(2);
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.bora, day: d, start: 900, end: 960, title: "Old", attendees: [] }, zone);
  const id = bookings[0]!.id;
  // As the migration leaves a booking made before it.
  await sql`update room_bookings set uid_salt = null where id = ${id}`;
  await cal.enqueue(sql, [cal.roomKey(id)]);
  await cal.flush(sql, zone);
  assert.ok(chest.calendar.has(`room:${id}`), "the legacy key");
  const legacy = await bookingIcs(sql, asMember(hugo), id, "en", origin);
  assert.match(legacy, new RegExp(`UID:${calendar.uidOf("rooms", `room:${id}`, origin.domain)}`, "u"));
  await rooms.cancelRoomBooking(sql, asMember(hugo), id, "one", zone);
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.has(`room:${id}`), false, "removed under the key the Chest holds");
  // A restored database gives the same id to another booking: another salt, another UID.
  assert.notEqual(calendar.uidOf("rooms", cal.calendarKeyOf(id, "0123456789ab"), origin.domain), calendar.uidOf("rooms", cal.calendarKeyOf(id, "ba9876543210"), origin.domain));
});

test("a day at the office is a whole free day in the member's own calendar; remote takes it out", async () => {
  const { sql } = database;
  const d = workday(3);
  const booked = await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: d, part: "am" }, zone);
  await cal.flush(sql, zone);
  const key = `day:${lea.id}:${d}`;
  const e = chest.calendar.get(key)!;
  assert.deepEqual(e.members, [lea.id]);
  assert.ok("days" in e && e.days.first === d && e.days.last === d);
  assert.equal(e.busy, false);
  assert.equal(e.title.fr, `Au bureau · poste ${booked.deskName} (matin)`);
  assert.equal(e.title.en, `At the office · desk ${booked.deskName} (morning)`);
  await setPresence(sql, asMember(lea), { day: d, status: "remote" }, zone);
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.has(key), false);
  // Said "office" without a desk: "At the office".
  await setPresence(sql, asMember(lea), { day: d, status: "office" }, zone);
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.get(key)?.title.en, "At the office");
  // A day changed again: a newer sequence, so calendars that hold it update it.
  const first = (await cal.eventOf(sql, key, zone))!;
  assert.ok(first.sequence > 0);
  await new Promise(resolve => setTimeout(resolve, 1100));
  await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: d, part: "pm" }, zone);
  const later = (await cal.eventOf(sql, key, zone))!;
  assert.ok(later.sequence > first.sequence, `${first.sequence} → ${later.sequence}`);
});

test("someone who leaves: their days go, they leave their guests' events; an erasure drops every key naming them", async () => {
  const { sql } = database;
  const d = workday(4);
  const { bookings } = await rooms.bookRoom(sql, asMember(camille), { roomId: o.bora, day: d, start: 600, end: 630, attendees: [sofia.id] }, zone);
  await setPresence(sql, asMember(sofia), { day: d, status: "office" }, zone);
  await cal.flush(sql, zone);
  const key = await published(bookings[0]!.id);
  assert.ok(chest.calendar.get(key)!.members.includes(sofia.id));
  await leave(sql, sofia.id, zone);
  assert.deepEqual(chest.calendar.get(key)!.members, [camille.id]);
  assert.equal(chest.calendar.has(`day:${sofia.id}:${d}`), false);
  await setPresence(sql, asMember(hugo), { day: d, status: "office" }, zone);
  await cal.flush(sql, zone);
  assert.ok(chest.calendar.has(`day:${hugo.id}:${d}`));
  await erase(sql, hugo.id, zone);
  assert.equal(chest.calendar.has(`day:${hugo.id}:${d}`), false);
  const left = await sql`select key from calendar_queue where key like ${"%" + hugo.id + "%"} union all select key from calendar_sent where key like ${"%" + hugo.id + "%"}`;
  assert.equal(left.length, 0);
});

test("an event over for a month leaves the calendars; one never sent is simply dropped", async () => {
  const { sql } = database;
  await sql`insert into calendar_sent (key, last_day) values ('room:999999', ${addDays(today(zone), -40)})`;
  chest.calendar.set("room:999999", { ...chest.calendar.values().next().value!, key: "room:999999" });
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.has("room:999999"), false);
  assert.equal((await sql`select count(*)::int as n from calendar_sent where key = 'room:999999'`)[0]!.n, 0);
});

test("the .ics files: one booking, all my coming bookings and days, in my language", async () => {
  const { sql } = database;
  const d = workday(5);
  const { bookings } = await rooms.bookRoom(sql, asMember(ines), { roomId: o.atlas, day: d, start: 840, end: 900, title: "Revue; trimestre, 3", attendees: [lea.id] }, zone);
  const file = await bookingIcs(sql, asMember(lea), bookings[0]!.id, "fr", origin);
  assert.match(file, /^BEGIN:VCALENDAR\r\n/u);
  assert.match(file, /METHOD:PUBLISH/u);
  assert.match(file, /SUMMARY:Revue\\; trimestre\\, 3/u);
  assert.match(file, /LOCATION:Atlas · Ground floor · Paris · 12 rue de Paradis/u);
  assert.match(file, new RegExp(`URL:https://rooms-chest.atelier.test/chest/rooms\\?day=${d}&booking=${bookings[0]!.id}`, "u"));
  assert.ok(file.split("\r\n").every(line => Buffer.byteLength(line) <= 75), "folded");
  await assert.rejects(bookingIcs(sql, asMember(lea), "999999", "fr", origin), { code: "not_found" });
  await setPresence(sql, asMember(ines), { day: d, status: "office" }, zone);
  const mine = await myIcs(sql, asMember(ines), "en", zone, { ...origin, name: "Rooms" });
  assert.equal(mine.match(/BEGIN:VEVENT/gu)?.length, 2);
  assert.match(mine, /SUMMARY:At the office/u);
  const csv = await myCsv(sql, asMember(ines), catalogue("en"), "en", zone);
  assert.match(csv, /Revue; trimestre, 3/u);
  assert.match(csv, /Where I said I would be/u);
});

test("on a Chest without the calendar: the tool learns it, keeps the keys, and asks again an hour later", async () => {
  const other = await fakeChest({ members: everyone, calendar: false });
  try {
    const { sql } = database;
    await sql`update settings set calendar = 'unknown', calendar_tried = null`;
    await rooms.bookRoom(sql, asMember(hugo), { roomId: o.bora, day: workday(6), start: 900, end: 930 }, zone);
    await cal.flush(sql, zone);
    assert.equal(await cal.state(sql), "off");
    const queued = (await sql`select count(*)::int as n from calendar_queue`)[0]!.n;
    assert.ok(queued >= 1);
    await cal.flush(sql, zone);
    assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, queued, "waits an hour");
  } finally {
    await other.close();
  }
  // Back on the Chest with the calendar, an hour later: everything goes.
  const { sql } = database;
  await sql`update settings set calendar_tried = now() - interval '2 hours'`;
  await cal.flush(sql, zone, 200);
  assert.equal(await cal.state(sql), "on");
  assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, 0);
});

test("a leave approved in Leave takes the office day out of the calendar; cancelled, the usual week may say it again", async () => {
  const { sql } = database;
  const d = workday(7);
  await setPresence(sql, asMember(lea), { day: d, status: "office" }, zone);
  await cal.flush(sql, zone);
  assert.ok(chest.calendar.has(`day:${lea.id}:${d}`));
  await chest.deliver({ type: "leave.approved", source: "leave", data: { member: lea.id, from: d, to: d, fromHalf: "day", toHalf: "day", request: "77" } }, POST);
  await cal.flush(sql, zone);
  assert.equal(chest.calendar.has(`day:${lea.id}:${d}`), false);
  await chest.deliver({ type: "leave.cancelled", source: "leave", data: { member: lea.id, request: "77" } }, POST);
  assert.equal((await sql`select count(*)::int as n from usual_applied where member_id = ${lea.id} and day = ${d}`)[0]!.n, 0);
});

test("what changed goes to the calendars in one write (putMany); an event the Chest refuses for good is dropped alone, the others still go; the Chest full, they wait", async () => {
  const { sql } = database;
  await cal.flush(sql, zone, 200);
  const writes: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.startsWith("/calendar/events")) writes.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return real(input, init);
  }) as typeof fetch;
  try {
    // Five office days of Sofia's: five events, one call.
    const days = [8, 9, 10, 11, 12].map(workday);
    for (const d of days) await sql`insert into presence (member_id, day, status, office_id) values (${sofia.id}, ${d}, 'office', ${o.office}) on conflict do nothing`;
    await cal.enqueue(sql, days.map(d => cal.dayKey(sofia.id, d)));
    await cal.flush(sql, zone);
    assert.deepEqual(writes, ["PUT /calendar/events"]);
    for (const d of days) assert.ok(chest.calendar.has(cal.dayKey(sofia.id, d)));

    // A day three years ahead (the Chest keeps two years) queued with one
    // it takes: the answer is per event (studio.16) — still one write, the
    // near one put and remembered, the far one dropped and never
    // remembered as sent.
    writes.length = 0;
    const far = addDays(today(zone), 3 * 366), near = workday(13);
    for (const d of [far, near]) await sql`insert into presence (member_id, day, status, office_id) values (${sofia.id}, ${d}, 'office', ${o.office}) on conflict do nothing`;
    await cal.enqueue(sql, [cal.dayKey(sofia.id, far), cal.dayKey(sofia.id, near)]);
    await cal.flush(sql, zone);
    assert.deepEqual(writes, ["PUT /calendar/events"], "one write, no event-by-event fallback");
    assert.ok(chest.calendar.has(cal.dayKey(sofia.id, near)));
    assert.equal(chest.calendar.has(cal.dayKey(sofia.id, far)), false);
    const sentKeys = (await sql<{ key: string }[]>`select key from calendar_sent where key like ${"day:" + sofia.id + ":%"}`).map(r => r.key);
    assert.ok(sentKeys.includes(cal.dayKey(sofia.id, near)));
    assert.equal(sentKeys.includes(cal.dayKey(sofia.id, far)), false, "a refused event is never remembered as sent");
    assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, 0, "the refused one is not retried for ever");

    // The Chest full (5,000 events): the new ones wait in the queue, not
    // remembered as sent, and go once there is room.
    const filler = [...Array(5000 - chest.calendar.size).keys()].map(i => `other:${i}`);
    for (const k of filler) chest.calendar.set(k, { key: k, members: [sofia.id], title: { en: "x" }, days: { first: near, last: near }, busy: false, private: false, updated: new Date().toISOString(), sequence: 0 } as never);
    const later = [14, 15].map(workday);
    for (const d of later) await sql`insert into presence (member_id, day, status, office_id) values (${sofia.id}, ${d}, 'office', ${o.office}) on conflict do nothing`;
    await cal.enqueue(sql, later.map(d => cal.dayKey(sofia.id, d)));
    await cal.flush(sql, zone);
    for (const d of later) assert.equal(chest.calendar.has(cal.dayKey(sofia.id, d)), false);
    assert.equal((await sql`select count(*)::int as n from calendar_sent where key = any(${later.map(d => cal.dayKey(sofia.id, d))}::text[])`)[0]!.n, 0);
    assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, 2, "they wait");
    for (const k of filler) chest.calendar.delete(k);
    await cal.flush(sql, zone);
    for (const d of later) assert.ok(chest.calendar.has(cal.dayKey(sofia.id, d)));
    assert.equal((await sql`select count(*)::int as n from calendar_queue`)[0]!.n, 0);
  } finally {
    globalThis.fetch = real;
  }
});
