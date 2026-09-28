import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { listCategories } from "../lib/categories.ts";
import * as items from "../lib/items.ts";
import { people } from "../lib/people.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, sofia } from "./support/members.ts";

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
const M = asMember(camille);

test("someone who leaves keeps what they hold (nothing comes back by itself); the managers are told once", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const laptop = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "MacBook Air" });
  const badge = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "key")!.id, name: "Badge" });
  const slack = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "licence")!.id, name: "Slack", seats: "5" });
  await items.give(sql, M, laptop.id, { to: { member: lea.id } });
  await items.give(sql, M, badge.id, { to: { member: lea.id } });
  await items.giveSeat(sql, M, slack.id, lea.id);
  chest.members.splice(chest.members.findIndex(m => m.id === lea.id), 1);
  chest.former.push({ id: lea.id, name: "Léa Dubois" });
  const event = { type: "member.removed" as const, id: "evt_" + "l".repeat(26), data: { id: lea.id } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit({ ...event, id: "evt_" + "m".repeat(26) }, POST), 204);
  const held = await items.holdings(sql, M, lea.id);
  assert.equal(held.items.length, 2);
  assert.equal(held.seats.length, 1);
  const toCamille = chest.notifications.filter(n => n.member === camille.id && n.key === `left:${lea.id}`);
  assert.equal(toCamille.length, 1);
  assert.equal(toCamille[0]!.title, "Léa Dubois est parti avec encore 3 objets");
  assert.equal(chest.notifications.find(n => n.member === sofia.id && n.key === `left:${lea.id}`)?.title, "Léa Dubois left and holds 3 items");
  const detail = await items.itemDetail(sql, M, laptop.id);
  assert.ok(detail.full);
  assert.deepEqual(detail.history.filter(h => h.kind === "left").length, 1);
  assert.equal((await people([lea.id])).get(lea.id)?.status, "former");
  // Once everything is back, the managers' item goes.
  const taken = await items.takeEverythingBack(sql, M, lea.id);
  assert.equal(chest.notifications.some(n => n.key === `left:${lea.id}`), false);
  // Undo puts it all back, even for someone who has left.
  await items.giveBackEverything(sql, M, lea.id, taken);
  const again = await items.holdings(sql, M, lea.id);
  assert.equal(again.items.length + again.seats.length, 3);
  await items.takeEverythingBack(sql, M, lea.id);
});

test("an erasure leaves the items with “Former member” until taken back, anonymises the history, and is acknowledged once", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const phone = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "phone")!.id, name: "iPhone 15" });
  const slack = (await items.listItems(sql, M, { q: "Slack" }))[0]!;
  await items.give(sql, M, phone.id, { to: { member: hugo.id } });
  await items.giveSeat(sql, M, slack.id, hugo.id);
  await items.giveSeat(sql, M, slack.id, ines.id);
  await items.report(sql, asMember(hugo), phone.id, "Cracked screen");
  const erasure = "era_" + "a".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "e".repeat(26), data: { id: hugo.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  assert.deepEqual(chest.acknowledged, [erasure]);
  const after1 = await items.itemDetail(sql, M, phone.id);
  assert.ok(after1.full);
  assert.equal(after1.item.holder, "erased");
  assert.equal(after1.item.status, "in_use");
  assert.equal(JSON.stringify(after1).includes(hugo.id), false);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from history where actor = ${hugo.id} or member = ${hugo.id}`;
  assert.equal(row?.n, 0);
  assert.equal((await sql`select 1 from problems where reported_by = ${hugo.id}`).length, 0);
  const erased = await items.holdings(sql, M, "erased");
  assert.deepEqual(erased.items.map(i => i.id), [phone.id]);
  assert.deepEqual(erased.seats.map(i => i.id), [slack.id]);
  // Taken back like anything else.
  await items.takeEverythingBack(sql, M, "erased");
  assert.equal((await items.holdings(sql, M, "erased")).items.length, 0);
  assert.equal((await items.itemDetail(sql, M, slack.id)).item.seatsUsed, 1);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
