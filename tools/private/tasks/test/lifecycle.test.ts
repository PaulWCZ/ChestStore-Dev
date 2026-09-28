import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as boards from "../lib/boards.ts";
import * as cards from "../lib/cards.ts";
import { en } from "../lib/i18n/en.ts";
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

test("someone who leaves is taken off their open cards (the history says so); done cards keep them", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(camille), { name: "Leaving" }, en.templates.columns);
  const [todo, , done] = await boards.columns(sql, b.id);
  const open = await cards.addCard(sql, asMember(camille), b.id, todo!.id, "Open");
  const finished = await cards.addCard(sql, asMember(camille), b.id, done!.id, "Finished");
  await cards.setAssignees(sql, asMember(camille), open.id, [hugo.id]);
  await cards.setAssignees(sql, asMember(camille), finished.id, [hugo.id]);
  assert.equal(await chest.emit({ type: "member.removed", data: { id: hugo.id } }, POST), 204);
  assert.deepEqual((await cards.cardDetail(sql, asMember(camille), open.id)).assignees, []);
  assert.equal((await cards.cardDetail(sql, asMember(camille), open.id)).history[0]?.kind, "unassigned_left");
  assert.deepEqual((await cards.cardDetail(sql, asMember(camille), finished.id)).assignees, [hugo.id]);
});

test("an erasure removes the person's id everywhere, keeps the team's work, and is acknowledged once", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(ines), { name: "Erase" }, en.templates.columns);
  const [todo] = await boards.columns(sql, b.id);
  const c = await cards.addCard(sql, asMember(ines), b.id, todo!.id, "Ines's card");
  await cards.addComment(sql, asMember(ines), c.id, "My comment");
  await cards.setAssignees(sql, asMember(camille), c.id, [ines.id]);
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const d = await cards.cardDetail(sql, asMember(camille), c.id);
  assert.deepEqual(d.assignees, []);
  assert.equal(d.createdBy, "erased");
  assert.equal(d.thread[0]?.author, "erased");
  assert.equal(d.thread[0]?.body, "My comment");
  assert.ok(d.history.every(h => h.actor !== ines.id && h.data["member"] !== ines.id));
  const [left] = await sql`select count(*)::int as n from board_people where member_id = ${ines.id}`;
  assert.equal(left!["n"], 0);
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
