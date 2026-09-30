import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as chestSettings from "@argentic/chest-sdk/chest";
import { POST as JOB } from "../app/chest-jobs/[name]/route.ts";
import { POST } from "../app/chest-events/route.ts";
import { listCategories } from "../lib/categories.ts";
import { leavingList, lastDayOf } from "../lib/departures.ts";
import * as items from "../lib/items.ts";
import { erase } from "../lib/lifecycle.ts";
import { addDays } from "../lib/model.ts";
import { forgetReturned, publishReturned, returnedLimits } from "../lib/returned.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";

// Equipment → People: equipment.returned {member}, key
// equipment:<member>:returned:<time>, once everything a leaving person held
// is back — whatever the path (a take-back, "Take everything back", a seat
// taken, given to someone else, lost, deleted), after they left the Chest
// too; never for someone not leaving, nor for a change undone; again later
// when the Chest could not take it. The contract is People's
// (tools/private/people/README.md, "With the other tools";
// tools/private/people/lib/returns.ts reads it).

let database: TestDatabase;
let chest: FakeChest;
const chestWith = (emits: string[]) => fakeChest({
  tool: "equipment", members: everyone, emits,
  schedules: [{ name: "weekly", cron: "50 7 * * 1" }, { name: "intune", cron: "40 5 * * *" }, { name: "returns", cron: "*/15 * * * *" }],
});
before(async () => {
  database = await testDatabase();
  chest = await chestWith(["equipment.returned"]);
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  const { sql } = database;
  await sql`delete from seats`;
  await sql`update items set holder = null, place = null, held_since = null, deleted_at = now()`;
  await sql`delete from departures`;
  await sql`delete from returned_events`;
});

const M = asMember(camille);
const lastDay = () => addDays(chestSettings.today(), 14);
const leaving = (member: string, day = lastDay()) => chest.deliver({ type: "people.leaving", source: "people", data: { member, lastDay: day } }, POST);
const fromNow = () => chest.published.length;
const since = (start: number) => chest.published.slice(start).map(e => ({ type: e.type, data: e.data }));
const keyOf = (member: string) => new RegExp(`^equipment:${member}:returned:\\d{13}$`, "u");
const pending = async () => Number((await database.sql`select count(*)::int as n from returned_events where published_at is null`)[0]!["n"]);

async function equip(member: string) {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const laptop = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "ThinkPad X1" });
  const badge = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "phone")!.id, name: "iPhone 15" });
  const figma = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "licence")!.id, name: "Figma", seats: "3" });
  await items.give(sql, M, laptop.id, { to: { member } });
  await items.give(sql, M, badge.id, { to: { member } });
  await items.giveSeat(sql, M, figma.id, member);
  return { laptop, badge, figma };
}

test("the manifest's proposals declare the event People reads, and a schedule to try again", () => {
  const proposals = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.proposals.json"), "utf8"));
  assert.deepEqual(proposals.emits, ["equipment.returned"]);
  assert.ok(proposals.schedules.some((s: { name: string; cron: string }) => s.name === "returns" && s.cron === "*/15 * * * *"));
  assert.ok(proposals.receives.includes("people.leaving"));
});

test("someone leaving: told once, when the last thing they held is back — not before, with the member only and the contract's key", async () => {
  const { sql } = database;
  const { laptop, badge, figma } = await equip(hugo.id);
  assert.equal(await leaving(hugo.id), 204);
  const start = fromNow();
  await items.takeBack(sql, M, laptop.id, {});
  await items.takeSeat(sql, M, figma.id, hugo.id);
  assert.equal(await publishReturned(sql), 0, "the phone is still with him");
  await items.takeBack(sql, M, badge.id, {});
  assert.equal(await publishReturned(sql), 1);
  assert.deepEqual(since(start), [{ type: "equipment.returned", data: { member: hugo.id } }]);
  assert.match(chest.published.at(-1)!.key!, keyOf(hugo.id));
  assert.equal(await publishReturned(sql), 0, "told once");
  assert.equal(await lastDayOf(sql, M, hugo.id), lastDay(), "still leaving: People's checklist runs until the last day");
});

test("“Take everything back”: one word for all of it; Undo then again: told again, under a new key", async () => {
  const { sql } = database;
  await equip(hugo.id);
  await leaving(hugo.id);
  const start = fromNow();
  const taken = await items.takeEverythingBack(sql, M, hugo.id);
  assert.equal(await pending(), 1, "three things back, one word");
  assert.equal(await publishReturned(sql), 1);
  await items.giveBackEverything(sql, M, hugo.id, taken);
  assert.equal(await pending(), 0, "given back: nothing to tell");
  await new Promise(resolve => setTimeout(resolve, 5));
  await items.takeEverythingBack(sql, M, hugo.id);
  assert.equal(await publishReturned(sql), 1);
  const told = chest.published.slice(start);
  assert.deepEqual(told.map(e => e.data), [{ member: hugo.id }, { member: hugo.id }]);
  assert.notEqual(told[0]!.key, told[1]!.key);
});

test("every other way the last thing leaves their hands counts: given to someone else, lost, deleted", async () => {
  const { sql } = database;
  for (const way of ["given", "lost", "deleted"] as const) {
    await sql`delete from returned_events`;
    const { laptop, badge, figma } = await equip(hugo.id);
    await leaving(hugo.id);
    await items.takeBack(sql, M, badge.id, {});
    await items.takeSeat(sql, M, figma.id, hugo.id);
    assert.equal(await pending(), 0, way);
    if (way === "given") await items.give(sql, M, laptop.id, { to: { member: sofia.id } });
    if (way === "lost") await items.setStatus(sql, M, laptop.id, "lost");
    if (way === "deleted") await items.deleteItem(sql, M, laptop.id);
    assert.equal(await pending(), 1, way);
    const start = fromNow();
    assert.equal(await publishReturned(sql), 1, way);
    assert.deepEqual(since(start), [{ type: "equipment.returned", data: { member: hugo.id } }], way);
  }
});

test("after they left the Chest, their laptop coming back is still told; the managers' lists leave the departure out", async () => {
  const { sql } = database;
  await equip(lea.id);
  await leaving(lea.id);
  chest.members.splice(chest.members.findIndex(m => m.id === lea.id), 1);
  chest.former.push({ id: lea.id, name: "Léa Dubois" });
  try {
    assert.equal(await chest.emit({ type: "member.removed", data: { id: lea.id } }, POST), 204);
    assert.deepEqual((await leavingList(sql, M)).filter(l => l.memberId === lea.id), []);
    assert.equal(await lastDayOf(sql, M, lea.id), null);
    const start = fromNow();
    await items.takeEverythingBack(sql, M, lea.id);
    assert.equal(await publishReturned(sql), 1);
    assert.deepEqual(since(start), [{ type: "equipment.returned", data: { member: lea.id } }]);
  } finally {
    chest.former.splice(chest.former.findIndex(m => m.id === lea.id), 1);
    chest.members.push(lea);
    chest.clearCaches();
  }
});

test("never told: someone not leaving, a departure taken back in People, someone who held nothing, an erasure, a change undone before it left", async () => {
  const { sql } = database;
  const start = fromNow();
  // Not leaving.
  await equip(ines.id);
  await items.takeEverythingBack(sql, M, ines.id);
  // Leaving, then taken back in People.
  await equip(hugo.id);
  await leaving(hugo.id);
  assert.equal(await chest.deliver({ type: "people.leaving_cancelled", source: "people", data: { member: hugo.id } }, POST), 204);
  await items.takeEverythingBack(sql, M, hugo.id);
  // Leaving, holding nothing: nothing came back.
  await leaving(sofia.id);
  assert.equal(await pending(), 0);
  // Erased while leaving: their things stay held by "Former member", nothing waits under their id.
  await equip(lea.id);
  await leaving(lea.id);
  await erase(sql, lea.id);
  assert.equal(Number((await sql`select count(*)::int as n from returned_events where member_id = ${lea.id}`)[0]!["n"]), 0);
  assert.equal(Number((await sql`select count(*)::int as n from departures where member_id = ${lea.id}`)[0]!["n"]), 0);
  // Back, then given again before it could leave (an Undo while the Chest was away): dropped.
  await equip(hugo.id);
  await leaving(hugo.id);
  const taken = await items.takeEverythingBack(sql, M, hugo.id);
  assert.equal(await pending(), 1);
  await items.giveBackEverything(sql, M, hugo.id, taken);
  assert.equal(await publishReturned(sql), 0);
  assert.equal(await pending(), 0);
  assert.deepEqual(since(start), []);
});

test("a Chest that cannot take it yet: it waits, the schedule tells it later; forgotten after a day once told, after a week when never", async () => {
  const { sql } = database;
  await equip(hugo.id);
  await leaving(hugo.id);
  await chest.close();
  chest = await chestWith([]);
  try {
    await items.takeEverythingBack(sql, M, hugo.id);
    assert.equal(await publishReturned(sql), 0, "refused: waits");
    assert.equal(await pending(), 1);
  } finally {
    await chest.close();
    chest = await chestWith(["equipment.returned"]);
  }
  const start = fromNow();
  assert.equal(await chest.run("returns", JOB), 204);
  assert.deepEqual(since(start), [{ type: "equipment.returned", data: { member: hugo.id } }]);
  assert.equal(await pending(), 0);
  // Two runs at once, or a run delivered twice: nothing told twice.
  assert.equal(await chest.run("returns", JOB), 204);
  assert.equal(chest.published.length, start + 1);
  // Forgetting.
  await sql`insert into returned_events (member_id, at) values (${ines.id}, now() - make_interval(days => ${returnedLimits.keepDays + 1}))`;
  await forgetReturned(sql, new Date(Date.now() + 2 * 86_400_000));
  assert.equal(Number((await sql`select count(*)::int as n from returned_events`)[0]!["n"]), 0);
});
