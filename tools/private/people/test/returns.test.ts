import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent as POST } from "../src/lib/deliveries.ts";
import { examples } from "../src/lib/examples.ts";
import { en } from "../src/i18n/en.ts";
import * as j from "../src/lib/journeys.ts";
import { addDays } from "../src/shared/model.ts";
import { equipmentReturned, returnPhrase } from "../src/lib/returns.ts";
import { today } from "../src/lib/zone.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, sofia, tom } from "./support/members.ts";

// Equipment → People: equipment.returned {member} (everything the person
// held is back) ticks the return step of their running leaving checklist,
// marked as ticked by Equipment; the rest follows as for a tick. The
// contract is People's (README, "With the other tools"): Equipment does
// not publish it yet.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "people", members: everyone, receivers: 1 });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`delete from journeys`;
  await database.sql`delete from templates`;
});
const hr = asMember(camille);
const returned = (data: Record<string, unknown>, source = "equipment") => chest.deliver({ type: "equipment.returned", source, data }, POST);

async function leaving() {
  const { sql } = database;
  await j.addExamples(sql, hr, examples(en));
  const off = (await j.listTemplates(sql, hr)).find(t => t.kind === "offboarding")!;
  const started = await j.startJourney(sql, hr, { personId: tom.id, templateId: off.id, anchor: addDays(today(), 14) });
  const items = async () => (await j.journey(sql, hr, started.id)).items;
  return { id: started.id, items };
}

test("the manifest's proposals receive it", () => {
  const proposals = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.proposals.json"), "utf8"));
  assert.ok(proposals.receives.includes("equipment.returned"));
});

test("everything back: the return step ticks itself, by Equipment; told twice, nothing more", async () => {
  const { items } = await leaving();
  const step = (await items()).find(i => i.phrase === returnPhrase)!;
  assert.equal(step.done, false);
  assert.equal(await returned({ "member": tom.id }), 204);
  const after1 = (await items()).find(i => i.id === step.id)!;
  assert.equal(after1.done, true);
  assert.equal(after1.doneBy, "equipment");
  assert.deepEqual((await items()).filter(i => i.done).map(i => i.id), [step.id], "only that step");
  assert.equal(await returned({ "member": tom.id }), 204);
  assert.deepEqual((await items()).filter(i => i.done).map(i => i.id), [step.id]);
});

test("another tool, another shape, another person, a stopped checklist, a step HR reworded: nothing", async () => {
  const { sql } = database;
  const { id, items } = await leaving();
  assert.deepEqual(await equipmentReturned(sql, { id: "evt_1", type: "equipment.returned", source: "rooms", occurredAt: new Date().toISOString(), data: { "member": tom.id } } as never), []);
  assert.equal(await returned({ "member": "tom" }), 204);
  assert.equal(await returned({ person: tom.id }), 204);
  assert.equal(await returned({ "member": sofia.id }), 204);
  assert.equal((await items()).some(i => i.done), false);
  // Reworded by HR: HR's own step, HR's to tick.
  const step = (await items()).find(i => i.phrase === returnPhrase)!;
  await j.updateJourneyItem(sql, hr, step.id, { text: "Give back the van keys" });
  assert.equal(await returned({ "member": tom.id }), 204);
  assert.equal((await items()).some(i => i.done), false);
  await j.stopJourney(sql, hr, id, true);
  await sql`update journey_items set text = 'Return the laptop, badge and keys', phrase = ${returnPhrase} where id = ${step.id}`;
  assert.equal(await returned({ "member": tom.id }), 204);
  assert.equal((await items()).some(i => i.done), false, "a stopped checklist stays as it is");
});

test("the last open step: the checklist is complete and whoever started it hears of it", async () => {
  const { sql } = database;
  const { id, items } = await leaving();
  for (const i of await items()) if (i.phrase !== returnPhrase) await sql`update journey_items set done_at = now(), done_by = ${camille.id} where id = ${i.id}`;
  chest.notifications.length = 0;
  await returned({ "member": tom.id });
  assert.ok((await j.journey(sql, hr, id)).completedAt, "complete");
  assert.ok(chest.notifications.some(n => n.member === camille.id && n.key === `journey:${id}:done`), "HR told");
});
