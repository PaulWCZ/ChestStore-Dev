import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import { forgetGroups, groupsOf, membership } from "../lib/groups.ts";
import { people } from "../lib/people.ts";
import * as places from "../lib/places.ts";
import * as rooms from "../lib/room-bookings.ts";
import { setUsualWeek } from "../lib/usual.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, lea } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

// Rooms open to everyone, as on most Chests: no group gives the tool, so
// member(request).groups and the members API say [] (SDK 0.3.0). A room or
// an area kept for Sales still follows who is in Sales: Rooms asks the
// Chest (members.groups.of, with "groups": "read").

const open = everyone.map(p => ({ ...p, groups: [] }));
let database: TestDatabase;
let chest: FakeChest;
let o: Awaited<ReturnType<typeof office>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    members: open,
    capabilities: ["members", "notifications", "files", "groups"],
    groups: [
      { id: groups.sales, name: "Sales", members: [hugo.id], grants: false },
      { id: groups.office, name: "Office", members: [camille.id, lea.id], grants: false },
    ],
    chest: { timeZone: zone },
  });
  forgetGroups();
  o = await office(database.sql);
});
after(async () => {
  await chest.close();
  await database.close();
  forgetGroups();
});

const openMember = (p: (typeof everyone)[number]) => asMember({ ...p, groups: [] });

test("a member's every group, though none gives Rooms", async () => {
  assert.deepEqual(openMember(hugo).groups, []);
  assert.deepEqual(await groupsOf(openMember(hugo)), [groups.sales]);
  assert.deepEqual((await membership()).get(lea.id), [groups.office]);
  assert.deepEqual((await people([hugo.id])).get(hugo.id)?.groups, [groups.sales]);
});

test("a place kept for a group that does not give Rooms: its members book there, nobody else", async () => {
  const { sql } = database;
  const d = workday(4);
  await places.updateRoom(sql, openMember(camille), o.bora, { name: "Bora", capacity: 4, groupId: groups.sales });
  await places.setAreaGroup(sql, openMember(camille), o.area, groups.office);
  await rooms.bookRoom(sql, openMember(hugo), { roomId: o.bora, day: d, start: 600, end: 660 }, zone);
  await assert.rejects(rooms.bookRoom(sql, openMember(lea), { roomId: o.bora, day: d, start: 690, end: 720 }, zone), { code: "group_only" });
  await desks.bookDesk(sql, openMember(lea), { deskId: o.desks[0], day: d }, zone);
  await assert.rejects(desks.bookDesk(sql, openMember(hugo), { deskId: o.desks[1], day: d }, zone), { code: "group_only" });
  await assert.rejects(setUsualWeek(sql, openMember(hugo), { days: {}, deskId: o.desks[1] }, zone), { code: "group_only" });
});
