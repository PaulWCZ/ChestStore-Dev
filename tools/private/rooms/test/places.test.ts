import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../src/lib/desk-bookings.ts";
import * as places from "../src/lib/places.ts";
import * as rooms from "../src/lib/room-bookings.ts";
import { rules, setRules } from "../src/lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";
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

test("an admin builds an office; everyone with a role reads it; a member or no role changes nothing", async () => {
  const { sql } = database;
  const o = await office(sql, "Lyon");
  const all = await places.offices(sql, asMember(hugo));
  const lyon = all.find(x => x.id === o.office)!;
  assert.deepEqual(lyon.floors.map(f => f.name), ["Ground floor", "First floor"]);
  assert.deepEqual(lyon.floors[0]!.rooms.map(r => [r.name, r.capacity, r.equipment]), [["Atlas", 8, ["screen", "video"]]]);
  assert.deepEqual(lyon.floors[1]!.areas[0]!.desks.map(d => d.name), ["D-01", "D-02", "D-03", "D-04"]);
  await assert.rejects(places.offices(sql, asMember(nora)), { code: "forbidden" });
  await assert.rejects(places.addOffice(sql, asMember(hugo), { name: "Mine" }), { code: "forbidden" });
  await assert.rejects(places.addRoom(sql, asMember(ines), o.ground, { name: "X", capacity: 2 }), { code: "forbidden" });
  await assert.rejects(places.addDesks(sql, asMember(ines), o.area, 2), { code: "forbidden" });
  await assert.rejects(setRules(sql, asMember(hugo), { daysAhead: 60 }), { code: "forbidden" });
});

test("what an admin writes is checked: names, seats, equipment, counts", async () => {
  const { sql } = database;
  const o = await office(sql, "Checks");
  await assert.rejects(places.addOffice(sql, admin, { name: "  " }), { code: "empty" });
  await assert.rejects(places.addOffice(sql, admin, { name: "x".repeat(81) }), { code: "too_long" });
  await assert.rejects(places.addRoom(sql, admin, o.ground, { name: "Big", capacity: 0 }), { code: "invalid" });
  await assert.rejects(places.addRoom(sql, admin, o.ground, { name: "Big", capacity: 4, equipment: ["jacuzzi"] }), { code: "invalid" });
  await assert.rejects(places.addDesks(sql, admin, o.area, 51), { code: "invalid" });
  await assert.rejects(places.addRoom(sql, admin, "999999", { name: "Ghost", capacity: 2 }), { code: "not_found" });
  await assert.rejects(places.addFloor(sql, admin, "abc", "F"), { code: "not_found" });
  // Numbering goes on from the office's last desk.
  const more = await places.addDesks(sql, admin, o.area, 2);
  const names = (await places.offices(sql, admin)).find(x => x.id === o.office)!.floors[1]!.areas[0]!.desks.map(d => d.name);
  assert.equal(more.ids.length, 2);
  assert.deepEqual(names.slice(-2), ["D-05", "D-06"]);
});

test("a floor or an office goes only once empty; a room with a history is archived, its coming bookings cancelled", async () => {
  const { sql } = database;
  const o = await office(sql, "Remove");
  await assert.rejects(places.removeFloor(sql, admin, o.ground), { code: "not_empty" });
  await assert.rejects(places.removeOffice(sql, admin, o.office), { code: "not_empty" });
  const d = workday(1);
  const { bookings } = await rooms.bookRoom(sql, asMember(hugo), { roomId: o.atlas, day: d, start: 600, end: 660, attendees: [ines.id] }, zone);
  const removed = await places.removeRoom(sql, admin, o.atlas, zone);
  assert.deepEqual(removed.cancelled.map(b => [b.id, b.attendees]), [[bookings[0]!.id, [ines.id]]]);
  const [row] = await sql`select archived_at is not null as archived from rooms where id = ${o.atlas}`;
  assert.equal(row, undefined); // no past booking: deleted outright
  await places.removeRoom(sql, admin, o.bora, zone);
  await places.removeFloor(sql, admin, o.ground);
  for (const desk of o.desks) await places.removeDesk(sql, admin, desk);
  await places.removeArea(sql, admin, o.area);
  await places.removeOffice(sql, admin, o.office);
  assert.equal((await places.offices(sql, admin)).some(x => x.id === o.office), false);
});

test("giving a desk to someone cancels others' coming bookings on it, and one person holds one desk", async () => {
  const { sql } = database;
  const o = await office(sql, "Assign");
  const d = workday(1);
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: d }, zone);
  const given = await places.updateDesk(sql, admin, o.desks[0], { name: "D-01", features: ["window"], assignedTo: ines.id });
  assert.deepEqual(given.cancelled.map(c => [c.id, c.memberId]), [[b.id, hugo.id]]);
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: d }, zone), { code: "assigned" });
  // Ines books her own given desk without trouble; given a second one, the first is taken back.
  await places.updateDesk(sql, admin, o.desks[1], { name: "D-02", assignedTo: ines.id });
  const view = (await places.offices(sql, admin)).find(x => x.id === o.office)!.floors[1]!.areas[0]!.desks;
  assert.deepEqual(view.slice(0, 2).map(x => x.assignedTo), [null, ines.id]);
  await assert.rejects(places.updateDesk(sql, admin, o.desks[0], { name: "D-01", assignedTo: "bob" }), { code: "invalid" });
});

test("the rules: bounds checked, admins only", async () => {
  const { sql } = database;
  const set = await setRules(sql, admin, { daysAhead: 30, maxDeskDays: 3, repeatWeeks: 8, dayStart: 480, dayEnd: 1140, weekdays: [5, 1, 2, 3, 4], keepMonths: 6 });
  assert.deepEqual(set, { daysAhead: 30, maxDeskDays: 3, repeatWeeks: 8, dayStart: 480, dayEnd: 1140, weekdays: [1, 2, 3, 4, 5], keepMonths: 6, visitorDays: 30, checkIn: false });
  await assert.rejects(setRules(sql, admin, { daysAhead: 0 }), { code: "invalid" });
  await assert.rejects(setRules(sql, admin, { dayStart: 600, dayEnd: 540 }), { code: "invalid" });
  await assert.rejects(setRules(sql, admin, { dayStart: 450 }), { code: "invalid" });
  await assert.rejects(setRules(sql, admin, { weekdays: [] }), { code: "invalid" });
  await assert.rejects(setRules(sql, admin, { weekdays: [8] }), { code: "invalid" });
  await setRules(sql, admin, { maxDeskDays: null, daysAhead: 14, repeatWeeks: 12, dayStart: 420, dayEnd: 1200, keepMonths: 12 });
  assert.equal((await rules(sql)).maxDeskDays, null);
});
