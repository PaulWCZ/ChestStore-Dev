import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { parseCsv } from "../src/lib/csv.ts";
import * as desks from "../src/lib/desk-bookings.ts";
import { equipmentOf, importDesks, importRooms } from "../src/lib/import.ts";
import * as places from "../src/lib/places.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";
import { office, workday, zone } from "./support/places.ts";

// Files shaped as the tools a company leaves give them: the Google Admin
// console's resource download (test/fixtures/google-resources.csv, the
// columns Google's help names), a sheet with the Directory API's names in
// French Excel (semicolons), and a desk sheet (test/fixtures/desks.csv).
const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

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

test("CSV: quotes, doubled quotes, line breaks in a cell, semicolons, a byte-order mark", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, ""y""","line\nbreak"\r\n\r\n'), [["a", "b"], ['x, "y"', "line\nbreak"]]);
  assert.deepEqual(parseCsv("a;b\n1,5;2"), [["a", "b"], ["1,5", "2"]]);
  assert.deepEqual(equipmentOf("Google Meet hardware TV Whiteboard Wheelchair accessible"), ["screen", "video", "whiteboard", "accessible"]);
});

test("rooms from Google Workspace's resources file: meeting rooms only, floors made, features read; again changes nothing", async () => {
  const { sql } = database;
  const first = await importRooms(sql, asMember(camille), o.office, fixture("google-resources.csv"));
  assert.equal(first.added, 3);
  assert.equal(first.floors, 2); // "2" and "1" did not exist
  assert.deepEqual(first.skipped, [{ line: 5, reason: "not_a_room" }, { line: 6, reason: "bad_capacity" }]);
  const all = (await places.offices(sql, asMember(camille)))[0]!.floors.flatMap(f => f.rooms.map(r => ({ ...r, floor: f.name })));
  const everest = all.find(r => r.name === "Paris-2-Everest (12)")!;
  assert.deepEqual([everest.capacity, everest.floor, everest.equipment, everest.note], [12, "2", ["screen", "video", "whiteboard"], "Big table; HDMI, USB-C"]);
  assert.deepEqual(all.find(r => r.name.startsWith("Paris-2-Kili"))!.equipment, ["video", "accessible"]);
  const again = await importRooms(sql, asMember(camille), o.office, fixture("google-resources.csv"));
  assert.equal(again.added, 0);
  assert.equal(again.skipped.filter(s => s.reason === "exists").length, 3);
  const fr = await importRooms(sql, asMember(camille), o.office, fixture("google-api-fr.csv"));
  assert.equal(fr.added, 1);
  const atelier = (await places.offices(sql, asMember(camille)))[0]!.floors.flatMap(f => f.rooms).find(r => r.name === "Atelier")!;
  assert.deepEqual(atelier.equipment, ["screen", "whiteboard"]);
  await assert.rejects(importRooms(sql, asMember(hugo), o.office, fixture("google-resources.csv")), { code: "forbidden" });
  await assert.rejects(importRooms(sql, asMember(camille), o.office, "Seats\n4"), { code: "invalid" });
  await assert.rejects(importRooms(sql, asMember(camille), o.office, ""), { code: "empty" });
});

test("who has which desk: by name, new desks in a named area, one desk each; others' coming bookings of it are cancelled", async () => {
  const { sql } = database;
  const admin = asMember(camille);
  const quiet = await places.addArea(sql, admin, o.first, "Quiet zone");
  const [d12] = (await places.addDesks(sql, admin, quiet.id, 8)).ids.slice(-1);
  assert.ok(d12);
  const d = workday(2);
  const hugoOnD02 = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: d }, zone);
  const people = everyone.map(p => ({ id: p.id, name: p.name }));
  const done = await importDesks(sql, admin, o.office, fixture("desks.csv"), people);
  assert.equal(done.given, 3); // Sofia D-12, Léa D-02, Inès D-40 (new)
  assert.equal(done.added, 1);
  assert.deepEqual(done.skipped.map(s => [s.line, s.reason]), [[4, "no_area"], [5, "unknown_person"], [6, "no_desk"]]);
  assert.deepEqual(done.cancelled.map(c => c.id), [hugoOnD02.id]);
  const byName = new Map((await places.offices(sql, admin))[0]!.floors.flatMap(f => f.areas.flatMap(a => a.desks)).map(x => [x.name, x.assignedTo]));
  assert.equal(byName.get("D-12"), sofia.id);
  assert.equal(byName.get("D-02"), lea.id);
  assert.equal(byName.get("D-40"), ines.id);
  // Again: nothing new, nobody's desk taken.
  const again = await importDesks(sql, admin, o.office, fixture("desks.csv"), people);
  assert.equal(again.added, 0);
  assert.equal(again.cancelled.length, 0);
});
