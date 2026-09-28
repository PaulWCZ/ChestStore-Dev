import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { addNote, listNotes } from "../lib/notes.ts";
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

test("an erasure deletes the person's notes and is acknowledged, once even if delivered twice", async () => {
  const { sql } = database;
  await addNote(sql, asMember(hugo), "Hugo's note");
  await addNote(sql, asMember(camille), "Camille's note");
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "b".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.deepEqual((await listNotes(sql, asMember(camille))).map(n => n.body), ["Camille's note"]);
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
