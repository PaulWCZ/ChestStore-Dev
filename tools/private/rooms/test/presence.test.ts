import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../src/lib/desk-bookings.ts";
import { addDays, today } from "../src/shared/model.ts";
import { setMyOffice } from "../src/lib/places.ts";
import { atOffice, inMeetings, presenceOf, setPresence } from "../src/lib/presence.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
let other: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  o = await office(database.sql, "Paris");
  other = await office(database.sql, "Lyon");
});
after(async () => {
  await chest.close();
  await database.close();
});

test("each member says where they are, for themselves; the office they work from is remembered", async () => {
  const { sql } = database;
  const d = workday(1);
  const first = await setPresence(sql, asMember(ines), { day: d, status: "office" }, zone);
  assert.equal(first.previous, null);
  assert.deepEqual((await presenceOf(sql, [ines.id], d, d)).get(ines.id)?.get(d), { status: "office", officeId: o.office });
  await setMyOffice(sql, asMember(lea), other.office);
  await setPresence(sql, asMember(lea), { day: d, status: "office" }, zone);
  assert.deepEqual((await atOffice(sql, o.office, d, d)).get(d), [ines.id]);
  assert.deepEqual((await atOffice(sql, other.office, d, d)).get(d), [lea.id]);
  const again = await setPresence(sql, asMember(ines), { day: d, status: "remote" }, zone);
  assert.deepEqual(again.previous, { status: "office", officeId: o.office });
  assert.equal((await atOffice(sql, o.office, d, d)).get(d), undefined);
  await setPresence(sql, asMember(ines), { day: d, status: null }, zone);
  assert.equal((await presenceOf(sql, [ines.id], d, d)).get(ines.id), undefined);
});

test("saying remote or off frees the desk booked that day; undo brings both back", async () => {
  const { sql } = database;
  const d = workday(2);
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: d }, zone);
  const change = await setPresence(sql, asMember(hugo), { day: d, status: "off" }, zone);
  assert.deepEqual(change.freed, [b.id]);
  assert.deepEqual(await desks.deskDay(sql, asMember(hugo), o.office, d), []);
  await setPresence(sql, asMember(hugo), { day: d, status: change.previous!.status, officeId: change.previous!.officeId }, zone);
  await desks.restoreDesk(sql, asMember(hugo), b.id);
  assert.equal((await desks.deskDay(sql, asMember(hugo), o.office, d)).length, 1);
});

test("refusals: a past day, too far, a status that does not exist, an unknown office, no role", async () => {
  const { sql } = database;
  await assert.rejects(setPresence(sql, asMember(hugo), { day: addDays(today(zone), -1), status: "office" }, zone), { code: "past" });
  await assert.rejects(setPresence(sql, asMember(hugo), { day: addDays(today(zone), 120), status: "office" }, zone), { code: "too_far" });
  await assert.rejects(setPresence(sql, asMember(hugo), { day: workday(1), status: "beach" }, zone), { code: "invalid" });
  await assert.rejects(setPresence(sql, asMember(hugo), { day: workday(1), status: "office", officeId: "9999" }, zone), { code: "not_found" });
  await assert.rejects(setPresence(sql, asMember(nora), { day: workday(1), status: "office" }, zone), { code: "forbidden" });
  await assert.rejects(setMyOffice(sql, asMember(nora), o.office), { code: "forbidden" });
});

// Presence agrees with meetings: the organiser and the guests of a room
// booking are at that office that day — unless they said otherwise.
test("people in a meeting in a room count at its office, unless they said remote or off", async () => {
  const { sql } = database;
  const d = workday(3);
  await rooms.bookRoom(sql, asMember(sofia), { roomId: o.atlas, day: d, start: 600, end: 660, title: "Workshop", attendees: [hugo.id, lea.id] }, zone);
  assert.deepEqual((await atOffice(sql, o.office, d, d)).get(d), [hugo.id, lea.id, sofia.id].sort());
  assert.equal((await atOffice(sql, other.office, d, d)).get(d), undefined, "not at another office");
  await setPresence(sql, asMember(hugo), { day: d, status: "remote" }, zone);
  assert.deepEqual((await atOffice(sql, o.office, d, d)).get(d), [lea.id, sofia.id].sort(), "Hugo said remote");
  const meetings = await inMeetings(sql, [hugo.id, lea.id, ines.id], d, d);
  assert.deepEqual([...(meetings.get(hugo.id) ?? [])], [d]);
  assert.deepEqual([...(meetings.get(lea.id) ?? [])], [d]);
  assert.equal(meetings.get(ines.id), undefined);
});
