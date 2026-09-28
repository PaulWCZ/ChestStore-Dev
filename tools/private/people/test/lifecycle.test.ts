import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as members from "@argentic/chest-sdk/members";
import { POST } from "../app/chest-events/route.ts";
import * as j from "../lib/journeys.ts";
import { today } from "../lib/model.ts";
import { profile, updateJob, updateOwn } from "../lib/profiles.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia, tom } from "./support/members.ts";

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

const hr = asMember(camille);

async function setup() {
  const { sql } = database;
  await updateJob(sql, hr, ines.id, { title: "Head of sales" });
  await updateJob(sql, hr, hugo.id, { managerId: ines.id });
  await updateJob(sql, hr, nora.id, { managerId: ines.id });
  await updateOwn(sql, asMember(ines), { phone: "0612345678", birthday: { month: 5, day: 2 } });
  const t = await j.createTemplate(sql, hr, { kind: "onboarding", name: "Newcomer" });
  await j.addTemplateItem(sql, hr, t.id, { text: "Lunch", role: "manager", offset: 0 });
  await j.addTemplateItem(sql, hr, t.id, { text: "Coffee with Ines", role: "member", memberId: ines.id, offset: 1 });
  await j.addTemplateItem(sql, hr, t.id, { text: "Profile", role: "person", offset: 1 });
  const started = await j.startJourney(sql, hr, { personId: nora.id, templateId: t.id, anchor: today() });
  return { t, started };
}

test("someone who leaves: out of the directory, their reports without a manager, their steps back to HR, HR told — once", async () => {
  const { sql } = database;
  const { t, started } = await setup();
  const event = { type: "member.removed" as const, id: "evt_" + "c".repeat(26), data: { id: ines.id } };
  chest.members.splice(chest.members.findIndex(m => m.id === ines.id), 1);
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal((await profile(sql, hr, hugo.id)).managerId, null);
  assert.equal((await profile(sql, hr, nora.id)).managerId, null);
  const [row] = await sql`select left_at from profiles where member_id = ${ines.id}`;
  assert.ok(row?.left_at instanceof Date);
  const items = (await j.journey(sql, hr, started.id)).items;
  assert.deepEqual(items.map(i => i.assignee), [null, null, nora.id]);
  assert.deepEqual((await j.template(sql, hr, t.id)).items.map(i => [i.role, i.memberId]), [["manager", null], ["hr", null], ["person", null]]);
  const told = chest.notifications.filter(n => n.key === `left:${ines.id}`);
  assert.deepEqual(told.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.match(told.find(n => n.member === camille.id)!.body ?? "", /Hugo Bernard, Nora Petit n’ont plus de responsable/u);
  // Back in the Chest: the next directory read finds their profile again.
  chest.members.push({ ...ines });
  members.forget();
});

test("an erasure deletes their profile and the checklists about them, anonymises the rest, and is acknowledged", async () => {
  const { sql } = database;
  const { started } = await setup();
  await updateJob(sql, hr, tom.id, { managerId: nora.id });
  await j.tick(sql, asMember(nora), (await j.journey(sql, hr, started.id)).items.at(-1)!.id, true);
  const t2 = await j.createTemplate(sql, hr, { kind: "offboarding", name: "Leaving" });
  await j.addTemplateItem(sql, hr, t2.id, { text: "Return the laptop", role: "member", memberId: nora.id, offset: 0 });
  const other = await j.startJourney(sql, hr, { personId: lea.id, templateId: t2.id, anchor: today() });
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: nora.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal((await sql`select 1 from profiles where member_id = ${nora.id}`).length, 0);
  assert.equal((await profile(sql, hr, tom.id)).managerId, null);
  assert.equal((await sql`select 1 from journeys where person_id = ${nora.id}`).length, 0);
  assert.deepEqual((await j.journey(sql, hr, other.id)).items.map(i => i.assignee), ["erased"]);
  // The step given to Nora in Léa's checklist came from a template naming
  // her before the erasure: now 'erased'.
  const ids = await sql`select assignee, done_by from journey_items where assignee = ${nora.id} or done_by = ${nora.id}`;
  assert.equal(ids.length, 0);
  assert.equal((await sql`select count(*)::int as n from template_items where member_id = ${nora.id}`)[0]?.n, 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
