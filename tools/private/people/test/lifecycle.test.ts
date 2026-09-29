import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as members from "@argentic/chest-sdk/members";
import { POST } from "../app/chest-events/route.ts";
import * as j from "../lib/journeys.ts";
import { today } from "../lib/zone.ts";
import { profile, updateJob, updateOwn } from "../lib/profiles.ts";
import { departedManagers, directory } from "../lib/directory.ts";
import { createRecord, updateRecord } from "../lib/records.ts";
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

test("a manager who leaves: their reports keep their place (flagged), their steps go to HR, HR told — once", async () => {
  const { sql } = database;
  const { t, started } = await setup();
  await createRecord(sql, hr, { memberId: ines.id });
  const event = { type: "member.removed" as const, id: "evt_" + "c".repeat(26), data: { id: ines.id } };
  chest.members.splice(chest.members.findIndex(m => m.id === ines.id), 1);
  chest.former.push({ id: ines.id, name: ines.name });
  members.forget();
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  // Hugo and Nora still report to Inès, marked "manager has left": the org
  // chart keeps its branch, with Inès's place drawn as a card of her own.
  for (const who of [hugo, nora]) {
    const p = await profile(sql, hr, who.id);
    assert.deepEqual([p.managerId, p.managerLeft], [ines.id, true]);
  }
  const { entries } = await directory(sql, hr);
  assert.deepEqual(await departedManagers(sql, entries), [{ id: ines.id, name: "Inès Moreau", managerId: null }]);
  const [row] = await sql`select left_at from profiles where member_id = ${ines.id}`;
  assert.ok(row?.left_at instanceof Date);
  // Her open steps go to Camille, who started the checklist — never to nobody.
  const items = (await j.journey(sql, hr, started.id)).items;
  assert.deepEqual(items.map(i => i.assignee), [camille.id, camille.id, nora.id]);
  assert.deepEqual((await j.template(sql, hr, t.id)).items.map(i => [i.role, i.memberId]), [["manager", null], ["hr", null], ["person", null]]);
  assert.ok(chest.notifications.some(n => n.member === camille.id && n.key === `journey:${started.id}:todo`));
  const told = chest.notifications.filter(n => n.key === `left:${ines.id}`);
  assert.deepEqual(told.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  const body = told.find(n => n.member === camille.id)!.body ?? "";
  assert.match(body, /Hugo Bernard, Nora Petit gardent leur place dans l’organigramme/u);
  assert.match(body, /Ses 2 tâches de check-list reviennent aux RH/u);
  assert.match(body, /dernier jour dans son dossier RH/u);
  // A new manager for Hugo clears the flag; keeping Inès (the form sends
  // what it shows) is no change and no error.
  await updateJob(sql, hr, nora.id, { managerId: ines.id, title: "Sales assistant" });
  assert.equal((await profile(sql, hr, nora.id)).managerLeft, true);
  await updateJob(sql, hr, hugo.id, { managerId: camille.id });
  assert.deepEqual([(await profile(sql, hr, hugo.id)).managerId, (await profile(sql, hr, hugo.id)).managerLeft], [camille.id, false]);
  // A new checklist for Nora: her manager is gone, so that step goes to HR.
  const again = await j.startJourney(sql, hr, { personId: nora.id, templateId: t.id, anchor: today() });
  assert.equal((await j.journey(sql, hr, again.id)).items.find(i => i.role === "manager")?.assignee, camille.id);
  // Back in the Chest: the next directory read finds her profile again, and
  // she is Nora's manager again.
  chest.members.push({ ...ines });
  chest.former.splice(chest.former.findIndex(f => f.id === ines.id), 1);
  members.forget();
  await directory(sql, hr);
  assert.deepEqual([(await profile(sql, hr, nora.id)).managerId, (await profile(sql, hr, nora.id)).managerLeft], [ines.id, false]);
});

test("an erasure deletes their profile and the checklists about them, anonymises the rest, and is acknowledged", async () => {
  const { sql } = database;
  const { started } = await setup();
  await updateJob(sql, hr, tom.id, { managerId: nora.id });
  await j.tick(sql, asMember(nora), (await j.journey(sql, hr, started.id)).items.at(-1)!.id, true);
  const t2 = await j.createTemplate(sql, hr, { kind: "offboarding", name: "Leaving" });
  await j.addTemplateItem(sql, hr, t2.id, { text: "Return the laptop", role: "member", memberId: nora.id, offset: 0 });
  const other = await j.startJourney(sql, hr, { personId: lea.id, templateId: t2.id, anchor: today() });
  // Nora worked here: her record keeps what the staff register needs,
  // detached; her emergency contact and address go.
  const rec = await createRecord(sql, hr, { memberId: nora.id });
  await updateRecord(sql, hr, rec.id, { startDate: "2026-01-05", nationality: "Française", emergencyName: "Paul Petit", address: "1 rue de la Paix" });
  // Tom was expected but never started: his record goes.
  const future = await createRecord(sql, hr, { memberId: tom.id });
  await updateRecord(sql, hr, future.id, { startDate: "2099-01-04" });
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
  const [kept] = await sql`select member_id, legal_name, nationality, emergency_name, address, erased_at from records where id = ${rec.id}`;
  assert.deepEqual([kept?.member_id, kept?.legal_name, kept?.nationality, kept?.emergency_name, kept?.address, kept?.erased_at instanceof Date], [null, "Nora Petit", "Française", "", "", true]);
  assert.equal((await sql`select 1 from journal where actor = ${nora.id} or member_id = ${nora.id}`).length, 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
  // Tom's erasure: never started, so nothing of his record remains.
  const second = { type: "member.erased" as const, id: "evt_" + "e".repeat(26), data: { id: tom.id, erasure: "era_" + "b".repeat(26), deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(second, POST), 204);
  assert.equal((await sql`select 1 from records where id = ${future.id}`).length, 0);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
