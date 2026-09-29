import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as desks from "../lib/desk-bookings.ts";
import * as places from "../lib/places.ts";
import { addDays, mondayOf, today } from "../lib/model.ts";
import { atOffice, presenceOf } from "../lib/presence.ts";
import { setRules } from "../lib/settings.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";
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

test("a member books a free desk; it says they are at the office; nobody else gets it", async () => {
  const { sql } = database;
  const d = workday(1);
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[0], day: d }, zone);
  assert.deepEqual([b.deskName, b.areaName, b.day, b.part, b.memberId], ["D-01", "Open space", d, "day", hugo.id]);
  assert.equal((await presenceOf(sql, [hugo.id], d, d)).get(hugo.id)?.get(d)?.status, "office");
  assert.deepEqual((await atOffice(sql, o.office, d, d)).get(d), [hugo.id]);
  await assert.rejects(desks.bookDesk(sql, asMember(ines), { deskId: o.desks[0], day: d }, zone), { code: "taken" });
  await assert.rejects(desks.bookDesk(sql, asMember(ines), { deskId: o.desks[0], day: d, part: "am" }, zone), { code: "taken" });
  // One desk per person at a time.
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: d, part: "pm" }, zone), { code: "already_booked" });
  assert.deepEqual((await desks.deskDay(sql, asMember(lea), o.office, d)).map(x => x.memberId), [hugo.id]);
});

test("half days: a morning and an afternoon share a desk", async () => {
  const { sql } = database;
  const d = workday(2);
  await desks.bookDesk(sql, asMember(ines), { deskId: o.desks[2], day: d, part: "am" }, zone);
  await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[2], day: d, part: "pm" }, zone);
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[2], day: d, part: "day" }, zone), { code: "taken" });
  assert.deepEqual((await desks.deskDay(sql, asMember(hugo), o.office, d)).map(x => x.part).sort(), ["am", "pm"]);
});

test("two people clicking the same desk at the same moment: one gets it, the other hears it is taken", async () => {
  const { sql } = database;
  if (!process.env["TEST_DATABASE_URL"]) return; // PGlite serves one connection at a time: no race to play
  const d = workday(3);
  const results = await Promise.allSettled([
    desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[3], day: d }, zone),
    desks.bookDesk(sql, asMember(ines), { deskId: o.desks[3], day: d }, zone),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const refused = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(refused.reason.code, "taken");
});

test("refusals: the past, too far ahead, a closed day, a bad part, an unknown desk, no role", async () => {
  const { sql } = database;
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: addDays(today(zone), -1) }, zone), { code: "past" });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: workday(20) }, zone), { code: "too_far", values: { max: 14 } });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: weekend() }, zone), { code: "closed_day" });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: workday(1), part: "evening" }, zone), { code: "invalid" });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: "424242", day: workday(1) }, zone), { code: "not_found" });
  await assert.rejects(desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[1], day: "2026-02-30" }, zone), { code: "invalid" });
  await assert.rejects(desks.bookDesk(sql, asMember(nora), { deskId: o.desks[1], day: workday(1) }, zone), { code: "forbidden" });
  // An admin is not held to how far ahead.
  const far = await desks.bookDesk(sql, asMember(camille), { deskId: o.desks[1], day: workday(20) }, zone);
  await desks.cancelDesk(sql, asMember(camille), far.id);
});

test("desk days per week: the limit counts days, admins are not held to it", async () => {
  const { sql } = database;
  await setRules(sql, asMember(camille), { maxDeskDays: 1, daysAhead: 30 });
  try {
    const monday = mondayOf(workday(8));
    await desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: monday }, zone);
    await assert.rejects(desks.bookDesk(sql, asMember(lea), { deskId: o.desks[0], day: addDays(monday, 1) }, zone), { code: "desk_limit", values: { max: 1 } });
    await desks.bookDesk(sql, asMember(camille), { deskId: o.desks[1], day: monday }, zone);
    await desks.bookDesk(sql, asMember(camille), { deskId: o.desks[1], day: addDays(monday, 1) }, zone);
  } finally {
    await setRules(sql, asMember(camille), { maxDeskDays: null, daysAhead: 14 });
  }
});

test("cancel: the holder or an admin; another member cannot; undo brings it back if still free", async () => {
  const { sql } = database;
  // Desk 4 in the second week: no other test here books it then, whatever
  // today's date (workday(3) and workday(4) may be the same Monday).
  const d = workday(10);
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[3], day: d }, zone);
  await assert.rejects(desks.cancelDesk(sql, asMember(ines), b.id), { code: "forbidden" });
  await desks.cancelDesk(sql, asMember(hugo), b.id);
  await assert.rejects(desks.cancelDesk(sql, asMember(hugo), b.id), { code: "not_found" });
  await desks.restoreDesk(sql, asMember(hugo), b.id);
  // An admin frees it; Hugo cannot undo what he did not do; once someone else took it, undo says so.
  await desks.cancelDesk(sql, asMember(camille), b.id);
  await assert.rejects(desks.restoreDesk(sql, asMember(hugo), b.id), { code: "forbidden" });
  await desks.bookDesk(sql, asMember(ines), { deskId: o.desks[3], day: d }, zone);
  await assert.rejects(desks.restoreDesk(sql, asMember(camille), b.id), { code: "taken" });
});

test("the usual desk: the one given, else the last one booked", async () => {
  const { sql } = database;
  const b = await desks.bookDesk(sql, asMember(hugo), { deskId: o.desks[2], day: workday(6) }, zone);
  assert.deepEqual(await desks.usualDesk(sql, asMember(hugo), o.office), { id: o.desks[2], name: "D-03", areaName: "Open space", areaPreset: null, assigned: false });
  await desks.cancelDesk(sql, asMember(hugo), b.id);
  assert.equal(await desks.usualDesk(sql, asMember(nora), o.office), null);
});

test("changing desks: with move, my desk at that time is freed in the same step; undo puts it back", async () => {
  const { sql } = database;
  const d = workday(1);
  const area = await places.addArea(sql, asMember(camille), o.first, "Moves");
  const [a, b] = (await places.addDesks(sql, asMember(camille), area.id, 2)).ids;
  const first = await desks.bookDesk(sql, asMember(sofia), { deskId: a, day: d }, zone);
  await assert.rejects(desks.bookDesk(sql, asMember(sofia), { deskId: b, day: d }, zone), { code: "already_booked" });
  const second = await desks.bookDesk(sql, asMember(sofia), { deskId: b, day: d, part: "am", move: true }, zone);
  assert.deepEqual(second.replaced, [first.id]);
  const mine = async () => (await desks.deskDay(sql, asMember(sofia), o.office, d)).filter(x => x.memberId === sofia.id).map(x => x.deskId);
  assert.deepEqual(await mine(), [b]);
  await desks.cancelDesk(sql, asMember(sofia), second.id);
  await desks.restoreDesk(sql, asMember(sofia), first.id);
  assert.deepEqual(await mine(), [a]);
});
