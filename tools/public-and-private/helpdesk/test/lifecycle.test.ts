import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as tickets from "../lib/tickets.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

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

test("someone who leaves gives their tickets back to the inbox; an erasure keeps their answers, unsigned", async () => {
  const { sql } = database;
  const t = await tickets.fromForm(sql, { name: "A", email: "a@example.com", subject: "S", message: "M", language: "en" });
  await tickets.reply(sql, asMember(hugo), t.number, "My answer");
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, POST), 204);
  assert.equal((await tickets.ticket(sql, asMember(camille), t.number)).assignee, null);
  const erasure = "era_" + "e".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "f".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const d = await tickets.ticket(sql, asMember(camille), t.number);
  assert.deepEqual(d.messages.map(m => [m.author, m.body]), [[null, "M"], ["erased", "My answer"]]);
  assert.deepEqual(chest.acknowledged, [erasure]);
});
