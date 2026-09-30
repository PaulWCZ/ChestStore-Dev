import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST as events } from "../app/chest-events/route.ts";
import { POST as jobs } from "../app/chest-jobs/[name]/route.ts";
import { addComponent } from "../lib/components.ts";
import * as incidents from "../lib/incidents.ts";
import { incidentOpened, incidentResolved, refreshBadges } from "../lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, lea, nora, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "notifications", "mail"], schedules: [{ name: "updates", cron: "*/15 * * * *" }], chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "fr" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("an erasure writes 'erased' wherever the person is named, keeps the texts, and is acknowledged once", async () => {
  const { sql } = database;
  const c = await addComponent(sql, asMember(camille), { name: "Website" });
  const { incidentId, updateId } = await incidents.openIncident(sql, asMember(tom), { title: "Down", status: "investigating", body: "Tom wrote this.", states: { [c.id]: "major" } });
  await incidents.editUpdate(sql, asMember(tom), updateId, "Tom corrected this.");
  const { updateId: second } = await incidents.addUpdate(sql, asMember(camille), incidentId, { status: "identified", body: "Camille wrote this." });
  await incidents.removeUpdate(sql, asMember(tom), second);
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "b".repeat(26), data: { id: tom.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, events), 204);
  assert.equal(await chest.emit(event, events), 204);
  assert.deepEqual(chest.acknowledged, [erasure]);
  const i = await incidents.incidentFor(sql, asMember(camille), incidentId);
  assert.equal(i.createdBy, "erased");
  assert.equal(i.updates.find(u => u.id === updateId)!.author, "erased");
  assert.equal(i.updates.find(u => u.id === updateId)!.body, "Tom corrected this.", "the text stays: it was public");
  assert.equal(i.updates.find(u => u.id === second)!.removedBy, "erased");
  assert.equal(i.updates.find(u => u.id === second)!.author, camille.id);
  assert.deepEqual(i.updates.find(u => u.id === updateId)!.log.map(l => l.actor), ["erased"]);
  const rows = await sql`select 1 from incidents where created_by = ${tom.id} union all select 1 from updates where author = ${tom.id} or removed_by = ${tom.id} union all select 1 from update_log where actor = ${tom.id}`;
  assert.equal(rows.length, 0);
});

test("leaving or losing access changes nothing: the page stays true", async () => {
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: lea.id } }, events), 204);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: lea.id } }, events), 204);
});

test("a delivery not signed by the Chest is refused, events and schedules alike", async () => {
  const response = await events(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
  const run = await jobs(new Request("http://tool.test/chest-jobs/updates", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(run.status, 401);
});

test("the 'updates' schedule posts a maintenance's start in the Chest's language", async () => {
  const { sql } = database;
  const c = await addComponent(sql, asMember(camille), { name: "Shop" });
  const now = new Date();
  const { incidentId } = await incidents.planMaintenance(sql, asMember(camille), { title: "Upgrade", body: "x", start: new Date(now.getTime() + 1000), end: new Date(now.getTime() + 3600000), components: [c.id], autoPosts: true }, now);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(await chest.run("updates", jobs), 204);
  const m = await incidents.incidentFor(sql, asMember(camille), incidentId);
  assert.equal(m.updates[0]!.status, "in_progress");
  assert.equal(m.updates[0]!.body, "La maintenance a commencé.");
});

test("the team hears of an incident in their language, only people with the role; its resolution replaces the item; badges count what is open", async () => {
  const { sql } = database;
  chest.notifications.length = 0;
  await incidentOpened({ id: "41", title: "Payments fail" }, "major", ["Payments"]);
  const items = chest.notifications.filter(n => n.key === "incident:41");
  assert.deepEqual(items.map(n => n.member).sort(), [camille.id, lea.id, tom.id].sort());
  assert.equal(items.find(n => n.member === camille.id)!.title, "Incident : Payments fail");
  assert.equal(items.find(n => n.member === tom.id)!.title, "Incident: Payments fail");
  assert.equal(items.find(n => n.member === tom.id)!.body, "Major outage — Payments");
  assert.equal(items[0]!.path, "/chest/incidents/41");
  assert.ok(!chest.notifications.some(n => n.member === nora.id));
  await incidentResolved({ id: "41", title: "Payments fail" });
  const after = chest.notifications.filter(n => n.key === "incident:41");
  assert.equal(after.length, 3);
  assert.equal(after.find(n => n.member === tom.id)!.title, "Resolved: Payments fail");
  // Beyond the Chest's 30 broadcasts an hour, the tool notifies its team itself.
  for (let i = 0; i < 30; i++) await incidentOpened({ id: String(100 + i), title: "Again" }, "degraded", []);
  const fallback = chest.notifications.filter(n => n.key === "incident:129");
  assert.deepEqual(fallback.map(n => n.member).sort(), [camille.id, lea.id, tom.id].sort());
  await refreshBadges(sql);
  const open = (await sql`select count(*)::int as count from incidents where kind = 'incident' and status <> 'resolved' and removed_at is null`)[0]!["count"];
  assert.equal(chest.badges.get(tom.id) ?? 0, open);
  assert.equal(chest.badges.get(nora.id), undefined);
});
