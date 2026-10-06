import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "@argentic/chest-app";
import { listCategories } from "../src/lib/categories.ts";
import * as items from "../src/lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let laptops: string, licences: string, keys: string;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
  const cats = await listCategories(database.sql, asMember(camille));
  laptops = cats.find(c => c.key === "laptop")!.id;
  licences = cats.find(c => c.key === "licence")!.id;
  keys = cats.find(c => c.key === "key")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const M = asMember(camille), H = asMember(hugo), I = asMember(ines);

test("a manager adds items; tags follow EQ-0001 and stay unique", async () => {
  const { sql } = database;
  const a = await items.createItem(sql, M, { categoryId: laptops, name: "MacBook Pro 14", serial: "C02XK1", price: "2 399,00", purchasedOn: "2025-03-01", warrantyUntil: "2028-03-01", supplier: "Apple" });
  const b = await items.createItem(sql, M, { categoryId: laptops, name: "ThinkPad T14" });
  assert.equal(a.tag, "EQ-0001");
  assert.equal(b.tag, "EQ-0002");
  assert.equal(a.priceCents, 239900);
  assert.equal(a.status, "in_stock");
  const own = await items.createItem(sql, M, { categoryId: keys, name: "Office key", tag: "KEY-7" });
  assert.equal(own.tag, "KEY-7");
  await refused(items.createItem(sql, M, { categoryId: keys, name: "Other key", tag: "key-7" }), "tag_taken");
  await refused(items.createItem(sql, M, { categoryId: keys, name: "" }), "empty");
  await refused(items.createItem(sql, M, { categoryId: keys, name: "x", price: "lots" }), "invalid_money");
  await refused(items.createItem(sql, M, { categoryId: keys, name: "x", warrantyUntil: "2026-13-01" }), "invalid_date");
  await refused(items.createItem(sql, M, { categoryId: "999", name: "x" }), "not_found");
  await refused(items.createItem(sql, M, { categoryId: licences, name: "Figma" }), "invalid_seats");
  // Tags skip over one a person chose in the series.
  await items.createItem(sql, M, { categoryId: keys, name: "Badge", tag: "EQ-0003" });
  assert.equal((await items.createItem(sql, M, { categoryId: keys, name: "Badge 2" })).tag, "EQ-0004");
});

test("members and people without a role change nothing", async () => {
  const { sql } = database;
  const [item] = await items.listItems(sql, M, { q: "ThinkPad" });
  await refused(items.createItem(sql, H, { categoryId: laptops, name: "Mine now" }), "forbidden");
  await refused(items.updateItem(sql, H, item!.id, { name: "x" }), "forbidden");
  await refused(items.give(sql, H, item!.id, { to: { member: hugo.id } }), "forbidden");
  await refused(items.takeBack(sql, H, item!.id), "forbidden");
  await refused(items.setStatus(sql, H, item!.id, "lost"), "forbidden");
  await refused(items.deleteItem(sql, H, item!.id), "forbidden");
  await refused(items.holdings(sql, H, hugo.id), "forbidden");
  await refused(items.overview(sql, H), "forbidden");
  await refused(items.listItems(sql, asMember(nora)), "forbidden");
  await refused(items.listItems(sql, null), "forbidden");
  await refused(items.mine(sql, asMember(nora)), "forbidden");
});

test("give, transfer and take back, each in the history; the holder hears of it in their language", async () => {
  const { sql } = database;
  const [mac] = await items.listItems(sql, M, { q: "MacBook" });
  const given = await items.give(sql, M, mac!.id, { to: { member: ines.id }, note: "Like new" });
  assert.equal(given.holder, ines.id);
  assert.equal(given.status, "in_use");
  const bell = chest.notifications.find(n => n.member === ines.id && n.key === `item:${mac!.id}:given`);
  assert.equal(bell?.title, "Camille vous a remis MacBook Pro 14 EQ-0001");
  await refused(items.give(sql, M, mac!.id, { to: { member: ines.id } }), "already_there");
  await refused(items.give(sql, M, mac!.id, { to: { member: "mbr_ghost" + "a".repeat(21) } }), "not_member");
  await refused(items.give(sql, M, mac!.id, { to: { member: hugo.id }, day: "2999-01-01" }), "invalid_date");
  // A transfer: back from Inès, given to Hugo; Inès's bell item goes.
  const moved = await items.give(sql, M, mac!.id, { to: { member: hugo.id }, day: "2026-01-05" });
  assert.equal(moved.holder, hugo.id);
  assert.equal(moved.heldSince, "2026-01-05");
  assert.equal(chest.notifications.some(n => n.member === ines.id && n.key === `item:${mac!.id}:given`), false);
  assert.equal(chest.notifications.find(n => n.member === hugo.id)?.title, "Camille gave you MacBook Pro 14 EQ-0001");
  const back = await items.takeBack(sql, M, mac!.id, { note: "Scratch on the lid", status: "in_repair" });
  assert.deepEqual(back.from, { member: hugo.id });
  assert.equal(back.item.status, "in_repair");
  assert.equal(back.item.holder, null);
  await refused(items.takeBack(sql, M, mac!.id), "not_held");
  const detail = await items.itemDetail(sql, M, mac!.id);
  assert.ok(detail.full);
  assert.deepEqual(detail.history.map(h => h.kind), ["returned", "given", "returned", "given", "created"]);
  assert.equal(detail.history[0]!.note, "Scratch on the lid");
  // To a place.
  const placed = await items.give(sql, M, mac!.id, { to: { place: "Meeting room" } });
  assert.equal(placed.place, "Meeting room");
  assert.deepEqual(await items.places(sql, H), ["Meeting room"]);
  await items.takeBack(sql, M, mac!.id);
});

test("the history is append-only: the database refuses to change or delete it", async () => {
  const { sql } = database;
  await assert.rejects(sql`delete from history`, /append-only/u);
  await assert.rejects(sql`update history set note = 'changed'`, /append-only/u);
  await assert.rejects(sql`update history set actor = ${hugo.id} where actor = ${camille.id}`, /append-only/u);
});

test("statuses: a held item is taken back first; a retired item cannot be given", async () => {
  const { sql } = database;
  const [pad] = await items.listItems(sql, M, { q: "ThinkPad" });
  await items.give(sql, M, pad!.id, { to: { member: hugo.id } });
  const lost = await items.setStatus(sql, M, pad!.id, "lost", "Left on a train");
  assert.equal(lost.status, "lost");
  assert.equal(lost.holder, null);
  await refused(items.setStatus(sql, M, pad!.id, "in_use"), "invalid");
  await items.setStatus(sql, M, pad!.id, "retired");
  await refused(items.give(sql, M, pad!.id, { to: { member: hugo.id } }), "not_available");
  await items.setStatus(sql, M, pad!.id, "in_stock");
  assert.equal((await items.give(sql, M, pad!.id, { to: { member: lea.id } })).holder, lea.id);
});

test("licences have seats: never more than bought, one per person", async () => {
  const { sql } = database;
  const figma = await items.createItem(sql, M, { categoryId: licences, name: "Figma", seats: "2", renewsOn: "2027-01-15", cost: "45", period: "month" });
  assert.equal(figma.seats, 2);
  assert.equal(figma.costCents, 4500);
  assert.equal(figma.period, "month");
  assert.equal(figma.serial, null);
  await refused(items.give(sql, M, figma.id, { to: { member: hugo.id } }), "is_licence");
  await items.giveSeat(sql, M, figma.id, hugo.id);
  assert.equal(chest.notifications.find(n => n.member === hugo.id && n.key === `item:${figma.id}:seat`)?.title, "Camille gave you a seat of Figma");
  await refused(items.giveSeat(sql, M, figma.id, hugo.id), "has_seat");
  await items.giveSeat(sql, M, figma.id, ines.id);
  await refused(items.giveSeat(sql, M, figma.id, lea.id), "no_seats");
  await refused(items.updateItem(sql, M, figma.id, { name: "Figma", seats: "1" }), "seats_below_used");
  await refused(items.updateItem(sql, M, figma.id, { categoryId: laptops, name: "Figma" }), "is_licence");
  const after1 = await items.takeSeat(sql, M, figma.id, ines.id);
  assert.equal(after1.seatsUsed, 1);
  await refused(items.takeSeat(sql, M, figma.id, ines.id), "not_held");
  const edited = await items.updateItem(sql, M, figma.id, { name: "Figma Professional", seats: "5", renewsOn: "2027-01-15", cost: "45", period: "month" });
  assert.equal(edited.seats, 5);
  const detail = await items.itemDetail(sql, M, figma.id);
  assert.ok(detail.full);
  assert.equal(detail.history[0]!.kind, "edited");
  assert.equal(detail.history[0]!.note, "name,seats");
  // Retiring a licence frees its seats.
  const retired = await items.setStatus(sql, M, figma.id, "retired");
  assert.equal(retired.seatsUsed, 0);
  await refused(items.giveSeat(sql, M, figma.id, hugo.id), "not_available");
  await items.setStatus(sql, M, figma.id, "in_stock");
});

test("a member sees the short view: no money, no supplier, no history; and their own list", async () => {
  const { sql } = database;
  const [mac] = await items.listItems(sql, M, { q: "MacBook" });
  await items.give(sql, M, mac!.id, { to: { member: ines.id } });
  const seen = await items.itemDetail(sql, I, mac!.id);
  assert.equal(seen.full, false);
  assert.equal(seen.full === false && seen.mine, true);
  assert.equal("priceCents" in seen.item, false);
  assert.equal("supplier" in seen.item, false);
  assert.equal("history" in seen, false);
  const other = await items.itemDetail(sql, H, mac!.id);
  assert.equal(other.full === false && other.mine, false);
  const mine = await items.mine(sql, I);
  assert.deepEqual(mine.items.map(i => i.id), [mac!.id]);
});

test("search finds a tag, a serial, a model, a holder by name; filters and sorts", async () => {
  const { sql } = database;
  // A serial number finds an item for a manager and for its holder, never
  // for another member (privacy, round 3).
  assert.deepEqual((await items.listItems(sql, M, { q: "c02xk" })).map(i => i.tag), ["EQ-0001"]);
  assert.deepEqual((await items.listItems(sql, I, { q: "c02xk" })).map(i => i.tag), ["EQ-0001"]);
  assert.deepEqual((await items.listItems(sql, H, { q: "c02xk" })).map(i => i.tag), []);
  assert.deepEqual((await items.listItems(sql, H, { q: "eq-0002" })).map(i => i.tag), ["EQ-0002"]);
  assert.deepEqual((await items.listItems(sql, H, { q: "Inès" })).map(i => i.tag), ["EQ-0001"]);
  assert.deepEqual((await items.listItems(sql, H, { q: "moreau" })).map(i => i.tag), ["EQ-0001"]);
  assert.deepEqual((await items.listItems(sql, H, { q: "100%" })), []);
  assert.deepEqual((await items.listItems(sql, H, { category: keys, sort: "name" })).map(i => i.name), ["Badge", "Badge 2", "Office key"]);
  assert.deepEqual((await items.listItems(sql, H, { holder: lea.id })).map(i => i.name), ["ThinkPad T14"]);
  assert.ok((await items.listItems(sql, H, { holder: "nobody" })).every(i => !i.holder && !i.place && i.seats === null));
  assert.ok((await items.listItems(sql, H, { status: "in_use" })).every(i => i.status === "in_use"));
});

test("a holder reports a problem: every manager hears it in their language; solved, it goes", async () => {
  const { sql } = database;
  const [mac] = await items.listItems(sql, M, { q: "MacBook" });
  const [key] = await items.listItems(sql, M, { q: "Office key" });
  await refused(items.report(sql, H, mac!.id, "Not mine but broken"), "not_found");
  await refused(items.report(sql, asMember(nora), mac!.id, "x"), "forbidden");
  await refused(items.report(sql, I, mac!.id, "  "), "empty");
  const p = await items.report(sql, I, mac!.id, "The battery lasts one hour");
  const toCamille = chest.notifications.find(n => n.member === camille.id && n.key === `problem:${p.id}`);
  const toSofia = chest.notifications.find(n => n.member === sofia.id && n.key === `problem:${p.id}`);
  assert.equal(toCamille?.title, "Inès a signalé un problème : MacBook Pro 14 EQ-0001");
  assert.equal(toSofia?.title, "Inès reported a problem: MacBook Pro 14 EQ-0001");
  assert.equal(toSofia?.body, "The battery lasts one hour");
  assert.equal(chest.badges.get(camille.id), 1);
  assert.equal(chest.notifications.some(n => n.member === ines.id && n.key === `problem:${p.id}`), false);
  assert.equal((await items.openProblems(sql, M)).length, 1);
  assert.equal((await items.mine(sql, I)).problems.length, 1);
  await refused(items.solve(sql, I, p.id), "forbidden");
  await items.solve(sql, M, p.id);
  await refused(items.solve(sql, M, p.id), "not_found");
  assert.equal(chest.notifications.some(n => n.key === `problem:${p.id}`), false);
  assert.equal(chest.badges.get(camille.id) ?? 0, 0);
  // A manager may note a problem on anything.
  await items.report(sql, M, key!.id, "Lock is stiff");
});

test("take everything back in one go, and give it all back with Undo", async () => {
  const { sql } = database;
  const [key] = await items.listItems(sql, M, { q: "Office key" });
  const figma = (await items.listItems(sql, M, { q: "Figma" }))[0]!;
  await items.give(sql, M, key!.id, { to: { member: hugo.id } });
  await items.giveSeat(sql, M, figma.id, hugo.id);
  const before = await items.holdings(sql, M, hugo.id);
  assert.equal(before.items.length, 1);
  assert.equal(before.seats.length, 1);
  const taken = await items.takeEverythingBack(sql, M, hugo.id);
  assert.deepEqual(taken, { items: [key!.id], seats: [figma.id] });
  const emptied = await items.holdings(sql, M, hugo.id);
  assert.equal(emptied.items.length + emptied.seats.length, 0);
  await items.giveBackEverything(sql, M, hugo.id, taken);
  const again = await items.holdings(sql, M, hugo.id);
  assert.deepEqual(again.items.map(i => i.id), [key!.id]);
  assert.deepEqual(again.seats.map(i => i.id), [figma.id]);
  const counts = await items.holderCounts(sql, M);
  assert.deepEqual(counts.get(hugo.id), { items: 1, seats: 1 });
});

test("delete is for a mistake: the item leaves the lists and comes back with Undo", async () => {
  const { sql } = database;
  const dup = await items.createItem(sql, M, { categoryId: keys, name: "Duplicate" });
  await items.deleteItem(sql, M, dup.id);
  assert.equal((await items.listItems(sql, M, { q: "Duplicate" })).length, 0);
  await refused(items.itemDetail(sql, M, dup.id), "not_found");
  const back = await items.restoreItem(sql, M, dup.id);
  assert.equal(back.tag, dup.tag);
  await refused(items.restoreItem(sql, M, dup.id), "not_found");
});

test("the overview lists warranties and renewals ending within 60 days", async () => {
  const { sql } = database;
  const soon = await items.createItem(sql, M, { categoryId: laptops, name: "Dell XPS", warrantyUntil: "2026-10-20" });
  await items.createItem(sql, M, { categoryId: laptops, name: "Old Dell", warrantyUntil: "2026-01-01" });
  const ov = await items.overview(sql, M, "2026-09-28");
  assert.ok(ov.ending.some(i => i.id === soon.id));
  assert.ok(!ov.ending.some(i => i.name === "Old Dell"));
});

test("two managers give the same item at once: the row is locked, the second finds it moved", async () => {
  const { sql } = database;
  const laptop = await items.createItem(sql, M, { categoryId: laptops, name: "Race laptop" });
  const results = await Promise.allSettled([
    items.give(sql, M, laptop.id, { to: { member: hugo.id }, from: null }),
    items.give(sql, asMember(sofia), laptop.id, { to: { member: ines.id }, from: null }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const lost = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.ok(lost.reason instanceof AppError && lost.reason.code === "moved");
  const held = (await items.itemDetail(sql, M, laptop.id)).item.holder;
  // A transfer from where it was seen goes; from where it was not, refused.
  const elsewhere = held === hugo.id ? ines.id : hugo.id;
  await refused(items.takeBack(sql, M, laptop.id, { from: { member: elsewhere } }), "moved");
  await refused(items.give(sql, M, laptop.id, { to: { member: elsewhere }, from: { member: elsewhere } }), "moved");
  assert.equal((await items.give(sql, M, laptop.id, { to: { member: elsewhere }, from: { member: held! } })).holder, elsewhere);
});

test("Undo of “take everything back” puts back only what was just taken from that person, never supplies", async () => {
  const { sql } = database;
  const stray = await items.createItem(sql, M, { categoryId: laptops, name: "Never theirs" });
  const kept = await items.createItem(sql, M, { categoryId: laptops, name: "Theirs" });
  await items.give(sql, M, kept.id, { to: { member: lea.id } });
  const taken = await items.takeEverythingBack(sql, M, lea.id);
  // The page could send any id: only what was taken from Léa comes back.
  await items.giveBackEverything(sql, M, lea.id, { items: [...taken.items, stray.id], seats: [] });
  assert.equal((await items.itemDetail(sql, M, kept.id)).item.holder, lea.id);
  assert.equal((await items.itemDetail(sql, M, stray.id)).item.holder, null);
});
