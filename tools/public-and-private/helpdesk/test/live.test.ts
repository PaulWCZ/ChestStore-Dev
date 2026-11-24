import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { requestChanged, tellRequesters } from "../src/lib/live.ts";
import * as tickets from "../src/lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { everyone, nora } from "./support/members.ts";

// Live pages (SDK 0.7.0's realtime): the team's pages follow the feeds of
// "desk"; My requests follows "mine:<member>", which the tool tells when
// the team answers a colleague's request — a table feeds one channel only.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8")) as { realtime: { channels: { name: string; join?: unknown }[]; feeds: { table: string; channel: string; columns: string[] }[] } };
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, chest: { timeZone: "Europe/Paris" }, members: everyone, capabilities: ["members", "notifications", "realtime"], realtime: manifest.realtime as never });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the desk is for the roles that read tickets; its feeds carry ids only; each member joins only their own requests", () => {
  const desk = manifest.realtime.channels.find(c => c.name === "desk")!;
  assert.deepEqual(desk.join, ["admin", "agent", "viewer"]);
  assert.ok(manifest.realtime.channels.some(c => c.name === "mine:{member}"));
  for (const feed of manifest.realtime.feeds) {
    assert.equal(feed.channel, "desk");
    assert.ok(feed.columns.every(c => /^(id|ticket_id|tag_id|source_id)$/u.test(c)), `${feed.table}: no content in a feed`);
  }
  assert.equal(new Set(manifest.realtime.feeds.map(f => f.table)).size, manifest.realtime.feeds.length, "a table feeds one channel");
});

test("the team's change to a colleague's request is told to that colleague's page only; a customer's request to no one", async () => {
  const { sql } = database;
  const customer = await tickets.fromForm(sql, { name: "Jean", email: "jean@example.com", subject: "Lamp", message: "Broken.", language: "en" });
  const colleague = await tickets.fromForms(sql, { event: "evt_live", source: { form: { id: "9", title: "IT request" }, answer: { id: "live1", path: null } }, subject: "Screen", body: "Black.", email: null, name: "", member: nora.id, language: "en" });
  await tellRequesters(sql, [customer.id, colleague.id]);
  assert.deepEqual(chest.realtime.published.map(p => [p.channel, p.event]), [[`mine:${nora.id}`, requestChanged]]);
  await tellRequesters(sql, []);
  assert.equal(chest.realtime.published.length, 1);
});
