import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as activities from "../lib/activities.ts";
import * as companies from "../lib/companies.ts";
import * as contacts from "../lib/contacts.ts";
import * as deals from "../lib/deals.ts";
import { today } from "../lib/model.ts";
import * as steps from "../lib/steps.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

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

test("someone who leaves: their deals, clients and next steps go unassigned, the history says so, managers are told", async () => {
  const { sql } = database;
  const co = await companies.addCompany(sql, asMember(hugo), { name: "Leaving Co" });
  const p = await contacts.addContact(sql, asMember(hugo), { name: "Left Contact", company: co.id });
  const d = await deals.addDeal(sql, asMember(hugo), { title: "Left deal", contact: p.id, value: 900 });
  await steps.setStep(sql, asMember(hugo), { deal: d.id }, { text: "Call", due: today() });
  const note = await activities.log(sql, asMember(hugo), { deal: d.id }, "note", "Hugo's note");
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, POST), 204);
  const after = await deals.deal(sql, asMember(camille), d.id);
  assert.equal(after.owner, null);
  assert.equal(after.step?.owner, null);
  assert.equal((await companies.company(sql, asMember(camille), co.id)).owner, null);
  assert.equal((await contacts.contact(sql, asMember(camille), p.id)).owner, null);
  const history = await activities.timeline(sql, { dealId: d.id });
  assert.equal(history[0]?.kind, "unassigned");
  assert.ok(history.some(a => a.id === note.id && a.author === hugo.id), "what they wrote stays theirs");
  // Camille (a manager) is told, in French.
  assert.deepEqual(chest.notifications.map(n => [n.member, n.title, n.body, n.path]), [[camille.id, "Hugo Bernard est parti : ses clients n’ont plus de responsable", "1 affaire · 1 prochaine étape · 2 entreprises ou contacts", "/chest/deals?view=list&owner=none"]]);
});

test("an erasure: their id is gone everywhere, their notes stay for the team, acknowledged once", async () => {
  const { sql } = database;
  const d = await deals.addDeal(sql, asMember(ines), { title: "Erased deal" });
  await deals.setOwner(sql, asMember(camille), d.id, ines.id);
  const note = await activities.log(sql, asMember(ines), { deal: d.id }, "note", "Ines's note");
  await steps.setStep(sql, asMember(ines), { deal: d.id }, { text: "Follow up", due: today() });
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const after = await deals.deal(sql, asMember(camille), d.id);
  assert.equal(after.owner, null);
  assert.equal(after.createdBy, "erased");
  const history = await activities.timeline(sql, { dealId: d.id });
  assert.equal(history.find(a => a.id === note.id)?.author, "erased");
  assert.equal(history.find(a => a.id === note.id)?.body, "Ines's note");
  const [left] = await sql`
    select (select count(*) from deals where owner = ${ines.id} or created_by = ${ines.id}) + (select count(*) from steps where owner = ${ines.id} or created_by = ${ines.id})
      + (select count(*) from activities where author = ${ines.id} or data::text like ${"%" + ines.id + "%"}) as n`;
  assert.equal(Number(left!["n"]), 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
