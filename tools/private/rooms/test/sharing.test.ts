import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import * as places from "../lib/places.ts";
import { setPresence } from "../lib/presence.ts";
import * as rooms from "../lib/room-bookings.ts";
import { setUsualWeek } from "../lib/usual.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea, nora, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

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

test("a given desk is lent on the days its holder is away, unless they keep it", async () => {
  const { sql } = database;
  const d = workday(2);
  const d2 = workday(3);
  await places.updateDesk(sql, asMember(camille), o.desks[3], { name: "D-04", assignedTo: sofia.id });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[3], day: d }, zone), { code: "assigned" });
  await setPresence(sql, asMember(sofia), { day: d, status: "remote" }, zone);
  assert.deepEqual([...(await desks.lentDesks(sql, o.office, d)).entries()], [[o.desks[3], sofia.id]]);
  const lent = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[3], day: d }, zone);
  assert.equal(lent.lent, true);
  // Sofia keeps her desk from now on: not lent on her next day away.
  await setPresence(sql, asMember(sofia), { day: d2, status: "off" }, zone);
  await setUsualWeek(sql, asMember(sofia), { days: {}, lendDesk: false }, zone);
  assert.equal((await desks.lentDesks(sql, o.office, d2)).size, 0);
  await assert.rejects(desks.bookDesk(sql, asMember(lea), { deskId: o.desks[3], day: d2 }, zone), { code: "assigned" });
  // Hugo cancels; Sofia comes back that day meanwhile: the undo is refused.
  await desks.cancelDesk(sql, asMember(hugo), lent.id);
  await setPresence(sql, asMember(sofia), { day: d, status: "office" }, zone);
  await assert.rejects(desks.restoreDesk(sql, asMember(hugo), lent.id), { code: "assigned" });
  await places.updateDesk(sql, asMember(camille), o.desks[3], { name: "D-04", assignedTo: null });
});

test("a room or an area kept for a group: its members and admins book there, nobody else", async () => {
  const { sql } = database;
  const d = workday(4);
  await places.updateRoom(sql, asMember(camille), o.bora, { name: "Bora", capacity: 4, groupId: groups.sales });
  await places.setAreaGroup(sql, asMember(camille), o.area, groups.office);
  // Hugo is in Sales, Lea in Office (test/support/members.ts).
  await rooms.bookRoom(sql, asMember(hugo), { roomId: o.bora, day: d, start: 600, end: 660 }, zone);
  await assert.rejects(rooms.bookRoom(sql, asMember(lea), { roomId: o.bora, day: d, start: 700 - 10, end: 720 }, zone), { code: "group_only" });
  await rooms.bookRoom(sql, asMember(camille), { roomId: o.bora, day: d, start: 720, end: 780 }, zone);
  await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: d }, zone);
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: d }, zone), { code: "group_only" });
  await assert.rejects(places.setAreaGroup(sql, asMember(hugo), o.area, null), { code: "forbidden" });
  await assert.rejects(places.setAreaGroup(sql, asMember(camille), o.area, "sales"), { code: "invalid" });
  const view = await places.offices(sql, asMember(hugo));
  assert.equal(view[0]!.floors.flatMap(f => f.rooms).find(r => r.id === o.bora)?.groupId, groups.sales);
  await places.setAreaGroup(sql, asMember(camille), o.area, null);
  await places.updateRoom(sql, asMember(camille), o.bora, { name: "Bora", capacity: 4, groupId: null });
});

test("an admin books a room or a desk for someone else; a member cannot; the person must have Rooms", async () => {
  const { sql } = database;
  const d = workday(5);
  const { bookings } = await rooms.bookRoom(sql, asMember(camille), { roomId: o.atlas, day: d, start: 540, end: 600, for: ines.id, attendees: [camille.id] }, zone);
  assert.equal(bookings[0]!.memberId, ines.id);
  assert.deepEqual(bookings[0]!.attendees, [camille.id]);
  const desk = await desks.bookDesk(sql, asMember(camille), { deskId: o.desks[2], day: d, for: ines.id }, zone);
  assert.equal(desk.memberId, ines.id);
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: d, for: ines.id }, zone), { code: "forbidden" });
  await assert.rejects(desks.bookDesk(sql, asMember(camille), { deskId: o.desks[1], day: d, for: nora.id }, zone), { code: "not_found" });
  await assert.rejects(desks.bookDesk(sql, asMember(camille), { deskId: o.desks[1], day: d, for: "mbr_nobodyaaaaaaaaaaaaaaaaaaaa" }, zone), { code: "not_found" });
  // Ines holds it now: she cancels it herself.
  await desks.cancelDesk(sql, asMember(ines), desk.id);
});

test("desks added to an area come after the ones already there, whatever their numbers", async () => {
  const { sql } = database;
  await sql`update desks set position = position + 8 where area_id = ${o.area}`;
  const { ids } = await places.addDesks(sql, asMember(camille), o.area, 2);
  const area = (await places.offices(sql, asMember(camille)))[0]!.floors.flatMap(f => f.areas).find(a => a.id === o.area)!;
  assert.deepEqual(area.desks.slice(-2).map(d => d.id), ids);
  assert.deepEqual(area.desks.map(d => d.name), ["D-01", "D-02", "D-03", "D-04", "D-05", "D-06"]);
});
