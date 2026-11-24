import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { chestEvents as POST } from "../src/lib/deliveries.ts";
import { AppError } from "../src/lib/app-error.ts";
import { incidentReplies, openIncidents, readIncident } from "../src/lib/incidents-in.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines, nora } from "./support/members.ts";

// Incidents from Status (events between tools, SDK 0.7.0): the event
// "status.incident" — flat fields, the texts per language as JSON (Status'
// README, "With the other tools"). While one is open, the inbox says so
// and a saved reply links its public page; resolved or removed, both go.
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

// Yesterday: within the Chest's 72 hours, and newer than the 30 days after
// which a resolved incident is forgotten.
const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
// As Status emits it (its src/lib/tell-tools.ts): titles and services as
// JSON texts; `over` changes the incident as Status keeps it.
const incident = (action: string, over: Record<string, unknown> = {}, at = `${day}T14:05:00.000Z`): Record<string, unknown> => {
  const i = {
    id: "42", title: "Payments unavailable", language: "en", titles: { en: "Payments unavailable", fr: "Paiement indisponible" } as unknown,
    status: action === "resolved" ? "resolved" : "investigating", impact: action === "resolved" ? "operational" : "major",
    startedAt: `${day}T14:00:00.000Z`, resolvedAt: null, url: "https://status.atelier.test/incidents/42" as unknown,
    services: [{ id: "3", names: { en: "Payments", fr: "Paiement" }, state: "major" }] as unknown,
    ...over,
  };
  return {
    incident: i.id, action, status: i.status, impact: i.impact, language: i.language, title: i.title,
    titles: JSON.stringify(i.titles), services: JSON.stringify(i.services),
    startedAt: i.startedAt, resolvedAt: i.resolvedAt, url: i.url, update: "311", updatedAt: at,
  };
};
// Emitted when its update was posted (occurredAt), about the incident (its subject).
const deliver = (data: Record<string, unknown>, audience: "all" | string[] = "all") => chest.deliver({ type: "status.incident", source: "status", subject: String(data["incident"]), audience, data, occurredAt: data["updatedAt"] as string }, POST);

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
  assert.equal(await deliver(incident("resolved", {}, `${day}T15:00:00.000Z`)), 204);
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), []);
  // The "updated" published at 14:30, delivered after the resolution of 15:00.
  assert.equal(await deliver(incident("updated", {}, `${day}T14:30:00.000Z`)), 204);
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), [], "out of order: ignored");
  assert.deepEqual(await incidentReplies(sql, asMember(hugo), "en", { customer: "Nina", agent: "Hugo" }, "en"), []);
  // Reopened later, then removed as a mistake.
  await deliver(incident("updated", { id: "43" }, `${day}T16:00:00.000Z`));
  assert.equal((await openIncidents(sql, asMember(hugo), "en")).length, 1);
  await deliver(incident("removed", { id: "43" }, `${day}T16:05:00.000Z`));
  assert.deepEqual(await openIncidents(sql, asMember(hugo), "en"), []);
});

test("a status.incident from any tool but Status is ignored", async () => {
  const { sql } = database;
  assert.equal(await chest.deliver({ type: "status.incident", source: "crm", subject: "78", data: incident("opened", { id: "78" }) }, POST), 204);
  assert.ok(!(await openIncidents(sql, asMember(hugo), "en")).some(i => i.id === "78"));
});

test("an incident only some people may see is not shown to every agent", async () => {
  const { sql } = database;
  assert.equal(await deliver(incident("opened", { id: "77" }), [hugo.id]), 204);
  assert.ok(!(await openIncidents(sql, asMember(hugo), "en")).some(i => i.id === "77"));
});

test("untrusted: another shape is ignored; texts are bounded, links only https", () => {
  const read = (data: Record<string, unknown>) => readIncident({ data });
  assert.equal(read({ ...incident("opened"), action: "exploded" }), null);
  assert.equal(read({ ...incident("opened"), startedAt: "yesterday" }), null);
  assert.equal(read(incident("opened", { id: "../1" })), null);
  assert.equal(read(incident("opened", { titles: {}, title: "" })), null);
  assert.equal(read({ ...incident("opened"), titles: "not json", title: "" }), null);
  const odd = read(incident("opened", { url: "javascript:alert(1)", title: "A‮B " + "x".repeat(400), titles: { de: "Zahlung" }, services: [{ names: { en: "Pay" }, state: "melted" }] }))!;
  assert.equal(odd.url, null);
  assert.equal(odd.titles.en!.length, 160);
  assert.ok(!odd.titles.en!.includes("‮"));
  assert.equal("de" in odd.titles, false);
  assert.equal(odd.services[0]!.state, "operational");
  assert.equal(read(incident("opened", { url: "http://127.0.0.1:13501/incidents/42" }))!.url, "http://127.0.0.1:13501/incidents/42", "a local harness");
});
