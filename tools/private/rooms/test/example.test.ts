import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { addExample, removeExample } from "../lib/example.ts";
import { bookingsCsv } from "../lib/export.ts";
import { catalogue } from "../lib/i18n/index.ts";
import * as desks from "../lib/desk-bookings.ts";
import * as places from "../lib/places.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";
import { workday, zone } from "./support/places.ts";

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
const en = catalogue("en"), fr = catalogue("fr");

test("Start with an example: two floors, three rooms, twelve desks, marked as an example; only admins; deleted whole while unused", async () => {
  const { sql } = database;
  await assert.rejects(addExample(sql, asMember(hugo), { office: "x", presets: en.presets }), { code: "forbidden" });
  const { id } = await addExample(sql, admin, { office: fr.places.example.office, presets: en.presets });
  const office = (await places.offices(sql, admin)).find(o => o.id === id)!;
  assert.equal(office.example, true);
  assert.equal(office.name, "Bureau d’exemple");
  assert.equal(office.floors.length, 2);
  assert.equal(office.floors.flatMap(f => f.rooms).length, 3);
  assert.deepEqual(office.floors.flatMap(f => f.areas.flatMap(a => a.desks.map(d => d.name))).sort(), Array.from({ length: 12 }, (_, i) => `D-${String(i + 1).padStart(2, "0")}`));
  await assert.rejects(removeExample(sql, asMember(hugo), id), { code: "forbidden" });
  await removeExample(sql, admin, id);
  assert.equal((await places.offices(sql, admin)).some(o => o.id === id), false);
  // Once someone booked in it, it is a real office: its places go one by one.
  const again = await addExample(sql, admin, { office: "Example office", presets: en.presets });
  const desk = (await places.offices(sql, admin)).find(o => o.id === again.id)!.floors[0]!.areas[0]!.desks[0]!;
  await desks.bookDesk(sql, asMember(hugo), { deskId: desk.id, day: workday() }, zone);
  await assert.rejects(removeExample(sql, admin, again.id), { code: "example_used" });
  // A real office is never deleted this way.
  const real = await places.addOffice(sql, admin, { name: "Real" });
  await assert.rejects(removeExample(sql, admin, real.id), { code: "not_found" });
});

test("the names the tool gives are keys: each reader sees them in their language, until an admin renames them", async () => {
  const { sql } = database;
  const { id } = await addExample(sql, admin, { office: "Example office", presets: en.presets });
  const inEnglish = (await places.offices(sql, admin, en.presets)).find(o => o.id === id)!;
  const inFrench = (await places.offices(sql, admin, fr.presets)).find(o => o.id === id)!;
  assert.deepEqual(inEnglish.floors.map(f => f.name), ["Ground floor", "First floor"]);
  assert.deepEqual(inFrench.floors.map(f => f.name), ["Rez-de-chaussée", "Premier étage"]);
  assert.deepEqual(inFrench.floors.map(f => f.areas[0]!.name), ["Zone calme", "Espace ouvert"]);
  // Without the reader's words: the names as stored (the Chest's language).
  assert.equal((await places.offices(sql, admin)).find(o => o.id === id)!.floors[0]!.name, "Ground floor");
  // Renamed, it is the team's word, the same for everyone.
  await places.renameFloor(sql, admin, inFrench.floors[0]!.id, "RDC");
  await places.renameArea(sql, admin, inFrench.floors[0]!.areas[0]!.id, "Calme");
  const after = (await places.offices(sql, admin, en.presets)).find(o => o.id === id)!;
  assert.equal(after.floors[0]!.name, "RDC");
  assert.equal(after.floors[0]!.areas[0]!.name, "Calme");
  assert.equal(after.floors[1]!.name, "First floor");
  // The CSV export speaks its reader's language too.
  const d = after.floors[1]!.areas[0]!.desks[0]!;
  await sql`insert into desk_bookings (desk_id, member_id, day, during) values (${d.id}, ${camille.id}, ${workday()}, tstzrange(now() + interval '1 day', now() + interval '2 days'))`;
  const csv = await bookingsCsv(sql, admin, workday(), workday(), fr, "fr", zone);
  assert.ok(csv.includes("Premier étage") && csv.includes("Espace ouvert"), csv);
});
