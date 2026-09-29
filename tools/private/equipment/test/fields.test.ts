import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/app-error.ts";
import { listCategories } from "../lib/categories.ts";
import { toCsv, parseCsv } from "../lib/csv.ts";
import { exportRows } from "../lib/export.ts";
import { addField, allFields, readExtra, removeField, renameField, restoreField } from "../lib/fields.ts";
import { catalogue } from "../lib/i18n/index.ts";
import { plan, type Context } from "../lib/importer.ts";
import * as items from "../lib/items.ts";
import { fieldValue } from "../lib/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
let phones: string, laptops: string, vehicles: string;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
  const cats = await listCategories(database.sql, asMember(camille));
  phones = cats.find(c => c.key === "phone")!.id;
  laptops = cats.find(c => c.key === "laptop")!.id;
  vehicles = cats.find(c => c.key === "vehicle")!.id;
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};
const M = asMember(camille), H = asMember(hugo);

test("values as people write them: text, numbers, dates", () => {
  assert.equal(fieldValue("text", "  macOS 15 "), "macOS 15");
  assert.equal(fieldValue("number", "16"), "16");
  assert.equal(fieldValue("number", "2,5"), "2.5");
  assert.equal(fieldValue("number", " 1 024 "), "1024");
  assert.equal(fieldValue("date", "2027-03-01"), "2027-03-01");
  assert.equal(fieldValue("text", ""), null);
  assert.throws(() => fieldValue("number", "sixteen"), (e: unknown) => e instanceof AppError && e.code === "invalid_field");
  assert.throws(() => fieldValue("date", "01/03/2027"), (e: unknown) => e instanceof AppError && e.code === "invalid_field");
});

test("a manager adds fields to a category; the items carry their values, searched and checked", async () => {
  const { sql } = database;
  await refused(addField(sql, H, { categoryId: phones, name: "IMEI" }), "forbidden");
  const imei = await addField(sql, M, { categoryId: phones, name: "IMEI" });
  await refused(addField(sql, M, { categoryId: phones, name: "imei" }), "field_taken");
  await refused(addField(sql, M, { categoryId: phones, name: "Line", type: "colour" }), "invalid");
  const ram = await addField(sql, M, { categoryId: laptops, name: "RAM (GB)", type: "number" });
  const plate = await addField(sql, M, { categoryId: vehicles, name: "Licence plate" });
  const inspection = await addField(sql, M, { categoryId: vehicles, name: "Next inspection", type: "date" });
  const phone = await items.createItem(sql, M, { categoryId: phones, name: "iPhone 15", extra: { [imei.id]: "356938035643809" } });
  assert.deepEqual(phone.extra, { [imei.id]: "356938035643809" });
  await refused(items.createItem(sql, M, { categoryId: phones, name: "x", extra: { [ram.id]: "16" } }), "invalid");
  await assert.rejects(items.createItem(sql, M, { categoryId: laptops, name: "x", extra: { [ram.id]: "lots" } }),
    (e: unknown) => e instanceof AppError && e.code === "invalid_field" && e.values["field"] === "RAM (GB)");
  const van = await items.createItem(sql, M, { categoryId: vehicles, name: "Renault Kangoo", extra: { [plate.id]: "GH-123-JK", [inspection.id]: "2027-05-10" } });
  // Found by a field's value.
  assert.deepEqual((await items.listItems(sql, M, { q: "GH-123" })).map(i => i.id), [van.id]);
  assert.deepEqual((await items.listItems(sql, M, { q: "3569380356" })).map(i => i.id), [phone.id]);
  // An edit keeps the values unless it says otherwise; the history says "the other fields".
  const edited = await items.updateItem(sql, M, phone.id, { name: "iPhone 15 Pro" });
  assert.deepEqual(edited.extra, phone.extra);
  await items.updateItem(sql, M, phone.id, { name: "iPhone 15 Pro", extra: { [imei.id]: "356938035643817" } });
  const detail = await items.itemDetail(sql, M, phone.id);
  assert.ok(detail.full && detail.history[0]!.note === "extra");
  // A member does not get the fields.
  const brief = await items.itemDetail(sql, H, phone.id);
  assert.equal("extra" in brief.item, false);
});

test("renamed, removed with Undo; at most 20 per category", async () => {
  const { sql } = database;
  const fields = await allFields(sql);
  const imei = fields.find(f => f.name === "IMEI")!;
  assert.equal((await renameField(sql, M, imei.id, "IMEI 1")).name, "IMEI 1");
  await removeField(sql, M, imei.id);
  assert.equal((await allFields(sql)).some(f => f.id === imei.id), false);
  // The values stay on the item, unseen.
  const [phone] = await items.listItems(sql, M, { q: "iPhone 15 Pro" });
  assert.ok(phone!.extra[imei.id]);
  await restoreField(sql, M, imei.id);
  await refused(restoreField(sql, M, imei.id), "not_found");
  for (let k = (await allFields(sql)).filter(f => f.categoryId === phones).length; k < 20; k++) await addField(sql, M, { categoryId: phones, name: `F${k}` });
  await refused(addField(sql, M, { categoryId: phones, name: "One too many" }), "too_many");
  assert.throws(() => readExtra([imei], { "999": "x" }), (e: unknown) => e instanceof AppError && e.code === "invalid");
});

test("the export has a column per field, and reads back into the same fields", async () => {
  const { sql } = database;
  const all = await items.listItems(sql, M);
  const fields = await allFields(sql);
  const t = catalogue("en");
  const text = toCsv(exportRows(all, t, "EUR", () => "", fields));
  const header = parseCsv(text)[0]!;
  assert.ok(header.includes("Licence plate") && header.includes("RAM (GB)") && header.includes("Next inspection"));
  const cats = await listCategories(sql, M);
  const context: Context = { people: [], tags: new Set(), serials: new Set(), categories: cats.map(c => ({ id: c.id, key: c.key, name: c.name, kind: c.kind })), fields };
  const p = plan(text, "csv", context);
  const van = p.rows.find(r => r.name === "Renault Kangoo")!;
  const plate = fields.find(f => f.name === "Licence plate")!, inspection = fields.find(f => f.name === "Next inspection")!;
  assert.deepEqual(van.extra, { [plate.id]: "GH-123-JK", [inspection.id]: "2027-05-10" });
  assert.deepEqual(p.newFields, []);
  assert.deepEqual(p.offered, []);
});
