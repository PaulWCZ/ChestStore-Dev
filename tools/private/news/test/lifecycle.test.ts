import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import * as posts from "../lib/posts.ts";
import { recordView } from "../lib/views.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ chest: { timeZone: "Europe/Paris" }, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const zone = "Europe/Paris";
const b32 = (c: string) => c.repeat(26);

test("leaving (or losing access) removes answers to events still to come; the rest stays", async () => {
  const { sql } = database;
  const future = await posts.createPost(sql, asMember(camille), { kind: "event", title: "Dinner", event: { day: "2099-05-01" } }, { zone });
  const past = await posts.createPost(sql, asMember(camille), { kind: "event", title: "Old", event: { day: "2099-01-01" } }, { zone });
  await posts.answer(sql, asMember(ines), future.id, "yes", { zone });
  await posts.answer(sql, asMember(ines), past.id, "yes", { zone });
  // The second event is over by now.
  await sql`update posts set event_day = '2026-01-01' where id = ${past.id}`;
  await posts.visit(sql, asMember(ines));
  assert.equal(await chest.emit({ type: "member.removed", data: { id: ines.id } }, POST), 204);
  const left = await sql<{ post_id: string }[]>`select post_id from rsvps where member = ${ines.id}`;
  assert.deepEqual(left.map(r => String(r.post_id)), [past.id]);
  assert.equal((await sql`select 1 from visits where member = ${ines.id}`).length, 0);
  assert.equal(await chest.emit({ type: "access.revoked", data: { id: ines.id } }, POST), 204);
});

test("an erasure leaves the company's posts unsigned, removes the person's own records, and is acknowledged once", async () => {
  const { sql } = database;
  const mine = await posts.createPost(sql, asMember(camille), { kind: "welcome", title: "Welcome Hugo", welcome: hugo.id, important: true }, { zone });
  await posts.addComment(sql, asMember(hugo), mine.id, "Thanks!");
  await posts.addComment(sql, asMember(ines), mine.id, `Welcome @[${hugo.id}]`);
  const forHugo = await posts.createPost(sql, asMember(camille), { kind: "info", title: "For Hugo", people: [hugo.id, ines.id] }, { zone });
  await recordView(sql, asMember(hugo), await posts.post(sql, asMember(camille), forHugo.id, { zone }));
  await posts.react(sql, asMember(hugo), mine.id, "heart", true);
  await posts.confirm(sql, asMember(hugo), mine.id);
  const hisEvent = await posts.createPost(sql, asMember(camille), { kind: "event", title: "Party", event: { day: "2099-06-01" } }, { zone });
  await posts.answer(sql, asMember(hugo), hisEvent.id, "yes", { zone });
  const byCamille = await posts.createPost(sql, asMember(camille), { kind: "info", title: "Camille's" }, { zone });
  const erasure = "era_" + b32("a");
  const event = { type: "member.erased" as const, id: "evt_" + b32("b"), data: { id: camille.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  const erasureHugo = "era_" + b32("c");
  assert.equal(await chest.emit({ type: "member.erased", id: "evt_" + b32("d"), data: { id: hugo.id, erasure: erasureHugo, deadline: new Date(Date.now() + 864e5).toISOString() } }, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const d = await posts.post(sql, asMember(ines), mine.id, { zone });
  assert.equal(d.author, "erased");
  assert.equal(d.welcome, "erased");
  assert.deepEqual(d.thread.map(c => [c.author, c.body]), [["erased", "Thanks!"], [ines.id, "Welcome @[erased]"]]);
  assert.deepEqual((await posts.post(sql, asMember(ines), forHugo.id, { zone })).people, [ines.id], "nobody knows the post was for him");
  assert.equal((await sql`select 1 from post_views where post_id = ${forHugo.id}`).length, 0, "his views stop counting");
  assert.equal(d.reactionList.find(r => r.emoji === "heart")!.count, 1);
  assert.equal((await sql`select 1 from confirmations where member = ${hugo.id}`).length, 0);
  assert.equal((await sql`select 1 from rsvps where member = ${hugo.id}`).length, 0);
  assert.equal((await posts.post(sql, asMember(ines), byCamille.id, { zone })).author, "erased");
  assert.equal((await sql`select count(*)::int as n from posts where author = ${camille.id} or welcome = ${hugo.id}`)[0]!.n, 0);
  assert.deepEqual(chest.acknowledged, [erasureHugo, erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
