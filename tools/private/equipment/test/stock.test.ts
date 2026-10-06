import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "@argentic/chest-app";
import { addCategory, categoryCounts, listCategories } from "../src/lib/categories.ts";
import { closeInventory, lastSeen, markSeen, progress, reopenInventory, report, startInventory, unmarkSeen } from "../src/lib/inventory.ts";
import * as items from "../src/lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let cats: Awaited<ReturnType<typeof listCategories>>;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
  cats = await listCategories(database.sql, asMember(camille));
});
after(async () => {
  await chest.close();
  await database.close();
});
const of = (key: string) => cats.find(c => c.key === key)!.id;
const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const M = asMember(camille), H = asMember(hugo);

// ---- Supplies counted in bulk ----------------------------------------------

test("supplies: a quantity and a minimum; handed out (to someone, a place, nobody), restocked", async () => {
  const { sql } = database;
  await refused(items.createItem(sql, M, { categoryId: of("consumable"), name: "Toner", quantity: "-1" }), "invalid_quantity");
  const toner = await items.createItem(sql, M, { categoryId: of("consumable"), name: "Toner HP 26A", quantity: "6", minQuantity: "2", supplier: "Bureau Vallée" });
  assert.equal(toner.quantity, 6);
  assert.equal(toner.minQuantity, 2);
  assert.equal(toner.serial, null);
  await refused(items.give(sql, M, toner.id, { to: { member: hugo.id } }), "is_consumable");
  await refused(items.handOut(sql, H, toner.id, { qty: "1" }), "forbidden");
  await refused(items.handOut(sql, M, toner.id, { qty: "7" }), "not_enough");
  await items.handOut(sql, M, toner.id, { qty: "1", to: { member: hugo.id }, note: "for the 2nd floor printer" });
  await items.handOut(sql, M, toner.id, { qty: "2", to: { place: "Office, 2nd floor" } });
  const after3 = await items.handOut(sql, M, toner.id, {});
  assert.equal(after3.quantity, 2);
  // At the minimum: the managers hear it once.
  const low = chest.notifications.filter(n => n.key === `low:${toner.id}`);
  assert.deepEqual(low.map(n => n.member).sort(), [camille.id, sofia.id].sort());
  assert.equal(low.find(n => n.member === sofia.id)?.title, "Toner HP 26A: 2 left");
  assert.deepEqual((await items.runningLow(sql, M)).map(i => i.id), [toner.id]);
  assert.deepEqual((await items.listItems(sql, M, { status: "low" })).map(i => i.id), [toner.id]);
  // Restocked above it: the word goes.
  const full = await items.restock(sql, M, toner.id, { qty: "10", note: "Order 4512" });
  assert.equal(full.quantity, 12);
  assert.equal(chest.notifications.some(n => n.key === `low:${toner.id}`), false);
  await refused(items.restock(sql, M, toner.id, { qty: "0" }), "invalid_quantity");
  const detail = await items.itemDetail(sql, M, toner.id);
  assert.ok(detail.full);
  assert.deepEqual(detail.history.slice(0, 4).map(h => [h.kind, h.qty, h.member, h.place]), [
    ["restocked", 10, null, null], ["handed_out", 1, null, null], ["handed_out", 2, null, "Office, 2nd floor"], ["handed_out", 1, hugo.id, null],
  ]);
  const counts = await categoryCounts(sql, M);
  assert.equal(counts.find(c => c.key === "consumable")!.inStock, 12);
  // A category of one's own may hold supplies too.
  const badges = await addCategory(sql, M, { name: "Visitor badges", kind: "consumable" });
  assert.equal(badges.kind, "consumable");
  await refused(addCategory(sql, M, { name: "x", kind: "cloud" }), "invalid");
  await refused(items.createItem(sql, M, { categoryId: badges.id, name: "Badges", count: "3" }), "is_consumable");
});

// ---- Bulk add, repairs, pages ----------------------------------------------

test("several identical laptops at once: one tag each, their serials in order; a series from one's own tag", async () => {
  const { sql } = database;
  const made = await items.createItems(sql, M, { categoryId: of("laptop"), name: "ThinkPad T14", count: "3", serials: "PF1\n\nPF2\nPF3\n" });
  assert.deepEqual(made.map(i => i.serial), ["PF1", "PF2", "PF3"]);
  assert.equal(new Set(made.map(i => i.tag)).size, 3);
  assert.deepEqual(made.map(i => i.tag), ["EQ-0002", "EQ-0003", "EQ-0004"]);
  const own = await items.createItems(sql, M, { categoryId: of("laptop"), name: "MacBook Air", count: "2", tag: "LAP-009" });
  assert.deepEqual(own.map(i => i.tag), ["LAP-009", "LAP-010"]);
  await refused(items.createItems(sql, M, { categoryId: of("laptop"), name: "x", count: "2", tag: "LAP-010" }), "tag_taken");
  await refused(items.createItems(sql, M, { categoryId: of("laptop"), name: "x", count: "2", tag: "KEYS" }), "tag_series");
  await refused(items.createItems(sql, M, { categoryId: of("laptop"), name: "x", count: "1", serials: ["A", "B"] }), "invalid_quantity");
  await refused(items.createItems(sql, M, { categoryId: of("laptop"), name: "x", count: "101" }), "invalid_quantity");
  await refused(items.createItems(sql, M, { categoryId: of("laptop"), name: "x", serials: ["A", "a"] }), "invalid");
  // Serials alone say how many.
  assert.equal((await items.createItems(sql, M, { categoryId: of("laptop"), name: "Dell", serials: ["D1", "D2"] })).length, 2);
});

test("a repair: its ticket and return day when it goes, its cost when it comes back", async () => {
  const { sql } = database;
  const [mac] = await items.listItems(sql, M, { q: "MacBook Air" });
  await items.give(sql, M, mac!.id, { to: { member: hugo.id } });
  await refused(items.setStatus(sql, M, mac!.id, "in_repair", null, { due: "someday" }), "invalid_date");
  await items.setStatus(sql, M, mac!.id, "in_repair", "Keyboard", { ref: "RMA-20431", due: "2030-01-10" });
  const repair = await items.repairOf(sql, mac!.id);
  assert.equal(repair?.ref, "RMA-20431");
  assert.equal(repair?.due, "2030-01-10");
  assert.equal((await items.itemDetail(sql, M, mac!.id)).item.holder, null);
  // The ticket said again later changes the day.
  await items.setStatus(sql, M, mac!.id, "in_repair", null, { due: "2030-01-20" });
  assert.equal((await items.repairOf(sql, mac!.id))?.due, "2030-01-20");
  assert.equal((await items.repairOf(sql, mac!.id))?.ref, "RMA-20431");
  const ov = await items.overview(sql, M);
  assert.equal(ov.repair.find(i => i.id === mac!.id)?.repair?.due, "2030-01-20");
  await items.setStatus(sql, M, mac!.id, "in_stock", null, { cost: "189,90" });
  assert.equal(await items.repairOf(sql, mac!.id), null);
  assert.deepEqual(await items.repairCosts(sql, mac!.id), { count: 1, cents: 18990 });
});

test("the list in pages of 100", async () => {
  const { sql } = database;
  for (let k = 0; k < 3; k++) await items.createItems(sql, M, { categoryId: of("accessory"), name: `Mouse ${k}`, count: "40" });
  const total = await items.countItems(sql, M, {});
  assert.ok(total > 120);
  const first = await items.listItems(sql, M, {}, 100, 0);
  const second = await items.listItems(sql, M, {}, 100, 100);
  assert.equal(first.length, 100);
  assert.equal(second.length, total - 100);
  assert.equal(new Set([...first, ...second].map(i => i.id)).size, total);
  assert.equal(await items.countItems(sql, M, { q: "Mouse 1" }), 40);
});

// ---- The inventory ----------------------------------------------------------

test("an inventory: started once, items seen by tag, label link or tick; closed, what was missed is kept", async () => {
  const { sql } = database;
  await refused(startInventory(sql, H), "forbidden");
  await refused(markSeen(sql, M, { text: "EQ-0002" }), "no_inventory");
  const inv = await startInventory(sql, M);
  await refused(startInventory(sql, M), "inventory_open");
  const before = await progress(sql, M);
  assert.ok(before);
  const scope = before.notSeen.length;
  // Only things counted one by one, not lost or retired.
  assert.ok(before.notSeen.every(i => i.category.kind === "asset"));
  const byTag = await markSeen(sql, M, { text: "eq-0002" });
  assert.equal(byTag.item.tag, "EQ-0002");
  assert.equal(byTag.already, false);
  assert.equal((await markSeen(sql, M, { text: " EQ-0002 " })).already, true);
  const link = await markSeen(sql, M, { text: `https://team.example.test/chest/items/${byTag.item.id === "3" ? "4" : "3"}` });
  assert.equal(link.already, false);
  const [toner] = await items.listItems(sql, M, { q: "Toner" });
  assert.equal((await markSeen(sql, M, { itemId: toner!.id })).outOfScope, true);
  await assert.rejects(markSeen(sql, M, { text: "NOPE-1" }), (e: unknown) => e instanceof AppError && e.code === "no_such_tag" && e.values["tag"] === "NOPE-1");
  await unmarkSeen(sql, M, link.item.id);
  const during = (await progress(sql, M))!;
  assert.equal(during.seen.length, 1);
  assert.equal(during.notSeen.length, scope - 1);
  assert.equal((await lastSeen(sql, byTag.item.id)).openSeen, true);
  const closed = await closeInventory(sql, M);
  assert.equal(closed.total, scope);
  assert.equal(closed.seen, 1);
  assert.equal(await progress(sql, M), null);
  const found = await report(sql, M, inv.id);
  assert.equal(found.missing.length, scope - 1);
  assert.ok((await lastSeen(sql, link.item.id)).missedIn);
  assert.ok((await lastSeen(sql, byTag.item.id)).seenAt);
  assert.equal((await lastSeen(sql, byTag.item.id)).missedIn, null);
  // Undo of the close: it goes on.
  await reopenInventory(sql, M, inv.id);
  assert.ok(await progress(sql, M));
  await closeInventory(sql, M);
  await refused(reopenInventory(sql, M, "999"), "not_found");
});
