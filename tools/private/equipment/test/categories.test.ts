import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { addCategory, categoryCounts, listCategories, removeCategory, restoreCategory, updateCategory } from "../lib/categories.ts";
import { createItem } from "../lib/items.ts";
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
const M = asMember(camille), H = asMember(hugo);
const refused = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);

test("nine built-in categories (supplies counted in bulk among them), named by the reader's catalogue; a manager renames, re-icons, adds and removes", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, H);
  assert.deepEqual(cats.map(c => c.key), ["laptop", "phone", "screen", "accessory", "licence", "key", "vehicle", "other", "consumable"]);
  assert.equal(cats.find(c => c.key === "consumable")!.kind, "consumable");
  assert.ok(cats.every(c => c.name === null));
  assert.equal(cats.find(c => c.key === "licence")!.kind, "licence");
  const phone = cats.find(c => c.key === "phone")!;
  await refused(updateCategory(sql, H, phone.id, { name: "Mobiles" }), "forbidden");
  assert.equal((await updateCategory(sql, M, phone.id, { name: "Mobiles", icon: "tablet" })).name, "Mobiles");
  assert.equal((await updateCategory(sql, M, phone.id, { name: "" })).name, null);
  await refused(updateCategory(sql, M, phone.id, { icon: "unicorn" }), "invalid");
  const drones = await addCategory(sql, M, { name: "Drones", icon: "camera" });
  assert.equal(drones.kind, "asset");
  const saas = await addCategory(sql, M, { name: "SaaS", icon: "licence", licence: true });
  assert.equal(saas.kind, "licence");
  await refused(addCategory(sql, H, { name: "x" }), "forbidden");
  await refused(addCategory(sql, M, { name: "" }), "empty");
  await refused(updateCategory(sql, M, drones.id, { name: "" }), "empty");
  await createItem(sql, M, { categoryId: drones.id, name: "DJI Mini 4" });
  await refused(removeCategory(sql, M, drones.id), "category_in_use");
  await removeCategory(sql, M, saas.id);
  assert.equal((await listCategories(sql, M)).some(c => c.id === saas.id), false);
  await restoreCategory(sql, M, saas.id);
  assert.equal((await listCategories(sql, M)).some(c => c.id === saas.id), true);
  const counts = await categoryCounts(sql, M);
  assert.deepEqual(counts.find(c => c.id === drones.id)?.inStock, 1);
});

test("at most 40 categories", async () => {
  const { sql } = database;
  for (let i = (await listCategories(sql, M)).length; i < 40; i++) await addCategory(sql, M, { name: `Kind ${i}` });
  await refused(addCategory(sql, M, { name: "One too many" }), "too_many");
});
