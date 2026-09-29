import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addCategory, categoryCounts, listCategories, setMembersSee } from "../lib/categories.ts";
import * as items from "../lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, nora } from "./support/members.ts";

// Privacy for members (critique round 3): who holds a key, a badge or a
// car, and every serial number, are not every employee's to read.

let database: TestDatabase;
let chest: FakeChest;
let laptops: string, keys: string, vehicles: string;
let mac: string, badge: string, car: string, safeKey: string;
const M = asMember(camille), H = asMember(hugo), I = asMember(ines);

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  const { sql } = database;
  const cats = await listCategories(sql, M);
  laptops = cats.find(c => c.key === "laptop")!.id;
  keys = cats.find(c => c.key === "key")!.id;
  vehicles = cats.find(c => c.key === "vehicle")!.id;
  mac = (await items.createItem(sql, M, { categoryId: laptops, name: "MacBook Air", serial: "FVFHJ3KLQ6L4" })).id;
  badge = (await items.createItem(sql, M, { categoryId: keys, name: "Alarm badge", serial: "BDG-0042" })).id;
  car = (await items.createItem(sql, M, { categoryId: vehicles, name: "Peugeot 208", serial: "VF3XXXXXXXX" })).id;
  safeKey = (await items.createItem(sql, M, { categoryId: keys, name: "Safe key" })).id;
  await items.give(sql, M, mac, { to: { member: ines.id } });
  await items.give(sql, M, badge, { to: { member: ines.id } });
  await items.give(sql, M, car, { to: { member: hugo.id } });
  await items.give(sql, M, safeKey, { to: { place: "Reception drawer" } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const byName = (list: items.Item[]) => new Map(list.map(i => [i.name, i]));

test("the defaults, in a new Chest and an existing one: keys and badges and vehicles hide their holders, the rest show them", async () => {
  const { sql } = database;
  const cats = await categoryCounts(sql, M);
  const see = Object.fromEntries(cats.filter(c => c.key).map(c => [c.key, c.membersSee]));
  assert.deepEqual(see, { laptop: true, phone: true, screen: true, accessory: true, licence: true, key: false, vehicle: false, other: true, consumable: true });
  // A category a manager adds shows its holders, like "Other".
  const tools = await addCategory(sql, M, { name: "Power tools" });
  assert.equal(tools.membersSee, true);
});

test("a member reads no one else's serial number, and no holder of a hidden category; their own stays whole", async () => {
  const { sql } = database;
  const seenByHugo = byName(await items.listItems(sql, H));
  // Inès's laptop: who has it, yes (a laptop shows its holders); its serial, no.
  assert.equal(seenByHugo.get("MacBook Air")!.holder, ines.id);
  assert.equal(seenByHugo.get("MacBook Air")!.serial, null);
  assert.equal(seenByHugo.get("MacBook Air")!.holderHidden, false);
  // Inès's alarm badge: held, by whom it does not say, nor since when.
  const b = seenByHugo.get("Alarm badge")!;
  assert.deepEqual([b.holder, b.place, b.heldSince, b.serial, b.holderHidden, b.status], [null, null, null, null, true, "in_use"]);
  // The safe key sits in a place: the place is hidden too.
  const k = seenByHugo.get("Safe key")!;
  assert.deepEqual([k.holder, k.place, k.holderHidden], [null, null, true]);
  // Hugo's own car: all of it, serial number included.
  assert.equal(seenByHugo.get("Peugeot 208")!.holder, hugo.id);
  assert.equal(seenByHugo.get("Peugeot 208")!.serial, "VF3XXXXXXXX");
  // Money, supplier, notes and fields never reach a member's list.
  assert.ok([...seenByHugo.values()].every(i => i.priceCents === null && i.supplier === null && i.notes === null && Object.keys(i.extra).length === 0 && i.invoice === null));
  // Inès sees her own badge and serials whole; a manager sees everything.
  const seenByInes = byName(await items.listItems(sql, I));
  assert.equal(seenByInes.get("Alarm badge")!.holder, ines.id);
  assert.equal(seenByInes.get("Alarm badge")!.serial, "BDG-0042");
  assert.equal(seenByInes.get("Peugeot 208")!.holder, null);
  const seenByCamille = byName(await items.listItems(sql, M));
  assert.equal(seenByCamille.get("Alarm badge")!.holder, ines.id);
  assert.equal(seenByCamille.get("Safe key")!.place, "Reception drawer");
  assert.equal(seenByCamille.get("MacBook Air")!.serial, "FVFHJ3KLQ6L4");
});

test("an item's short view hides the same things; a scanned badge says only that it is given", async () => {
  const { sql } = database;
  const d = await items.itemDetail(sql, H, badge);
  assert.equal(d.full, false);
  assert.deepEqual([d.item.holder, d.item.place, d.item.heldSince, d.item.serial, d.item.holderHidden], [null, null, null, null, true]);
  assert.equal(d.receipt, null);
  const laptop = await items.itemDetail(sql, H, mac);
  assert.equal(laptop.item.holder, ines.id);
  assert.equal(laptop.item.serial, null);
  const own = await items.itemDetail(sql, I, badge);
  assert.equal(own.item.holder, ines.id);
  assert.equal(own.item.serial, "BDG-0042");
  assert.equal(own.full === false && own.mine, true);
});

test("searching and filtering cannot find what a member may not read", async () => {
  const { sql } = database;
  const names = async (actor: typeof H, filters: items.Filters) => (await items.listItems(sql, actor, filters)).map(i => i.name).sort();
  // By a holder's name: the laptop (shown), never the badge (hidden).
  assert.deepEqual(await names(H, { q: "Moreau" }), ["MacBook Air"]);
  assert.deepEqual(await names(M, { q: "Moreau" }), ["Alarm badge", "MacBook Air"]);
  // By a serial number: only one's own.
  assert.deepEqual(await names(H, { q: "BDG-0042" }), []);
  assert.deepEqual(await names(I, { q: "BDG-0042" }), ["Alarm badge"]);
  assert.deepEqual(await names(H, { q: "VF3X" }), ["Peugeot 208"]);
  // By a place of a hidden category.
  assert.deepEqual(await names(H, { q: "Reception" }), []);
  assert.deepEqual(await names(M, { q: "Reception" }), ["Safe key"]);
  // The "With" filter, typed in the address.
  assert.deepEqual(await names(H, { holder: ines.id }), ["MacBook Air"]);
  assert.deepEqual(await names(H, { holder: "place:Reception drawer" }), []);
  assert.deepEqual(await names(H, { holder: hugo.id }), ["Peugeot 208"]);
  assert.equal(await items.countItems(sql, H, { holder: ines.id }), 1);
  assert.equal(await items.countItems(sql, M, { holder: ines.id }), 2);
  // The places a member may pick from.
  assert.deepEqual(await items.places(sql, H), []);
  assert.deepEqual(await items.places(sql, M), ["Reception drawer"]);
});

test("a manager chooses per category; members and others may not", async () => {
  const { sql } = database;
  await refused(setMembersSee(sql, H, keys, true), "forbidden");
  await refused(setMembersSee(sql, asMember(nora), keys, true), "forbidden");
  await refused(setMembersSee(sql, M, keys, "yes"), "invalid");
  await refused(setMembersSee(sql, M, "999", true), "not_found");
  assert.equal((await setMembersSee(sql, M, keys, true)).membersSee, true);
  assert.equal(byName(await items.listItems(sql, H)).get("Alarm badge")!.holder, ines.id);
  assert.deepEqual(await items.places(sql, H), ["Reception drawer"]);
  // Serial numbers stay hidden whatever the setting.
  assert.equal(byName(await items.listItems(sql, H)).get("Alarm badge")!.serial, null);
  await setMembersSee(sql, M, keys, false);
  await setMembersSee(sql, M, laptops, false);
  assert.equal(byName(await items.listItems(sql, H)).get("MacBook Air")!.holder, null);
  assert.equal(byName(await items.listItems(sql, I)).get("MacBook Air")!.holder, ines.id);
  await setMembersSee(sql, M, laptops, true);
});

test("the history reads in time order, whatever order its lines were written in", async () => {
  const { sql } = database;
  // As a back-filled or concurrent write leaves them: ids out of time order.
  await sql`insert into history (item_id, at, actor, kind, note) values (${mac}, '2023-10-05 09:30+02', ${camille.id}, 'reported', 'older, written last')`;
  const d = await items.itemDetail(sql, M, mac);
  assert.ok(d.full);
  const times = d.history.map(h => h.at);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(d.history.at(-1)!.note, "older, written last");
  // Lines written in one change keep their order (each its own moment).
  const rows = await sql<{ at: Date }[]>`select at from history where item_id = ${badge} order by id`;
  for (let k = 1; k < rows.length; k++) assert.ok(rows[k]!.at.getTime() >= rows[k - 1]!.at.getTime());
});
