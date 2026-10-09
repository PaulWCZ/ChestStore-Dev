import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/lib/deliveries.ts";
import { AppError } from "../src/lib/app-error.ts";
import { incidentReplies, openIncidents, readIncident } from "../src/lib/incidents-in.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, nora } from "./support/members.ts";

// Incidents from Status (Proposal (studio): events between tools): the
// event "status.incident", version 1 (Status' README, "With the other
// tools"). While one is open, the inbox says so and a saved reply links
// its public page; resolved or removed, both go.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});

const incident = (action: string, over: Record<string, unknown> = {}, at = "2026-09-29T14:05:00.000Z") => ({
  v: 1,
  action,
  incident: {
    id: "42", title: "Payments unavailable", language: "en", titles: { en: "Payments unavailable", fr: "Paiement indisponible" },
    status: action === "resolved" ? "resolved" : "investigating", impact: action === "resolved" ? "operational" : "major",
    started_at: "2026-09-29T14:00:00.000Z", resolved_at: null, url: "https://status.atelier.test/incidents/42",
    services: [{ id: "3", names: { en: "Payments", fr: "Paiement" }, state: "major" }],
    ...over,
  },
  update: { id: "311", status: "investigating", at },
});
// Published when its update was posted (the Chest stamps occurredAt).
const deliver = (data: Record<string, unknown>) => chest.deliver({ type: "status.incident", source: "status", data, occurredAt: (data["update"] as { at: string }).at }, POST);

test("an incident opened in Status shows in the inbox in the reader's language, with a saved reply in the customer's", async () => {
  const { sql } = database;
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), []);
  assert.equal(await deliver(incident("opened")), 204);
  const [en] = await openIncidents(sql, asMember(hugo), "en");
  assert.deepEqual([en!.title, en!.services, en!.url], ["Payments unavailable", ["Payments"], "https://status.atelier.test/incidents/42"]);
  const [fr] = await openIncidents(sql, asMember(ines), "fr");
  assert.deepEqual([fr!.title, fr!.services, fr!.lang], ["Paiement indisponible", ["Paiement"], "fr"]);
  // The reply is written in the ticket's language, titled in the agent's.
  const [reply] = await incidentReplies(sql, asMember(hugo), "fr", { customer: "Nina", agent: "Hugo" }, "en");
  assert.equal(reply!.title, "Incident: Payments unavailable");
  assert.match(reply!.filled, /^Bonjour Nina,\n\nNous avons connaissance d’un problème en ce moment : Paiement indisponible\./u);
  assert.match(reply!.filled, /https:\/\/status\.atelier\.test\/incidents\/42/u);
  assert.ok(reply!.filled.endsWith("Hugo"));
  const [noName] = await incidentReplies(sql, asMember(hugo), "en", { customer: "", agent: "Hugo" }, "en");
  assert.ok(noName!.filled.startsWith("Hello,\n"), "never “Hello ,”");
  // Only for those who read tickets.
  await assert.rejects(openIncidents(sql, asMember(nora), "en"), (e: unknown) => e instanceof AppError && e.code === "forbidden");
});

test("resolved or removed: gone; an event published earlier, arriving late, never brings it back", async () => {
  const { sql } = database;
  assert.equal(await deliver(incident("resolved", {}, "2026-09-29T15:00:00.000Z")), 204);
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), []);
  // The "updated" published at 14:30, delivered after the resolution of 15:00.
  assert.equal(await deliver(incident("updated", {}, "2026-09-29T14:30:00.000Z")), 204);
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), [], "out of order: ignored");
  assert.deepEqual(await incidentReplies(sql, asMember(hugo), "en", { customer: "Nina", agent: "Hugo" }, "en"), []);
  // Reopened later, then removed as a mistake.
  await deliver(incident("updated", { id: "43" }, "2026-09-29T16:00:00.000Z"));
  assert.equal((await openIncidents(sql, asMember(hugo), "en")).length, 1);
  await deliver(incident("removed", { id: "43" }, "2026-09-29T16:05:00.000Z"));
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), []);
});

test("untrusted: another shape is ignored; texts are bounded, links only https", () => {
  const read = (data: Record<string, unknown>) => readIncident({ data });
  assert.equal(read({ v: 1, action: "exploded", incident: incident("opened").incident }), null);
  assert.equal(read({ v: 0, action: "opened", incident: incident("opened").incident }), null);
  assert.equal(read({ v: 1, action: "opened", incident: { ...incident("opened").incident, id: "../1" } }), null);
  assert.equal(read({ v: 1, action: "opened", incident: { ...incident("opened").incident, titles: {}, title: "" } }), null);
  const odd = read(incident("opened", { url: "javascript:alert(1)", title: "A‮B " + "x".repeat(400), titles: { de: "Zahlung" }, services: [{ names: { en: "Pay" }, state: "melted" }] }))!;
  assert.equal(odd.url, null);
  assert.equal(odd.titles.en!.length, 160);
  assert.ok(!odd.titles.en!.includes("‮"));
  assert.equal("de" in odd.titles, false);
  assert.equal(odd.services[0]!.state, "operational");
  assert.equal(read(incident("opened", { url: "http://127.0.0.1:13501/incidents/42" }))!.url, "http://127.0.0.1:13501/incidents/42", "a local harness");
});
