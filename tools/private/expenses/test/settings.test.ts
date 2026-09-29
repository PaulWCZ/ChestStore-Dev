import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError, type ErrorCode } from "../lib/app-error.ts";
import * as settings from "../lib/settings.ts";
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
const refuses = (code: ErrorCode) => (e: unknown) => e instanceof AppError && e.code === code;

test("the company's settings: accountants only, a real currency, a yes/no reminder", async () => {
  const { sql } = database;
  assert.deepEqual(await settings.settings(sql), { currency: "EUR", reminder: true, setupDone: false, journal: { code: "NDF", employees: "421000", vat: "445660", card: "467000" }, payer: "" });
  await assert.rejects(settings.updateSettings(sql, asMember(ines), { currency: "CHF" }), refuses("forbidden"));
  await assert.rejects(settings.updateSettings(sql, asMember(camille), { currency: "FRF1" }), refuses("currency_invalid"));
  await assert.rejects(settings.updateSettings(sql, asMember(camille), { reminder: "yes" }), refuses("invalid"));
  const changed = await settings.updateSettings(sql, asMember(camille), { currency: "CHF", reminder: false, setupDone: true, journal: { vat: " 445661 " }, payer: " Atelier  Roux SARL " });
  assert.deepEqual(changed, { currency: "CHF", reminder: false, setupDone: true, journal: { code: "NDF", employees: "421000", vat: "445661", card: "467000" }, payer: "Atelier Roux SARL" });
  await assert.rejects(settings.updateSettings(sql, asMember(camille), { journal: { code: "N D F" } }), refuses("account_invalid"));
  await assert.rejects(settings.updateSettings(sql, asMember(camille), { journal: { card: "" } }), refuses("account_invalid"));
  await assert.rejects(settings.updateSettings(sql, asMember(camille), { setupDone: "yes" }), refuses("invalid"));
  await settings.updateSettings(sql, asMember(camille), { currency: "EUR", reminder: true });
});

test("categories: renamed and named back, accounts, VAT rule, limit, hidden; the trips' one stays", async () => {
  const { sql } = database;
  const meals = (await settings.categories(sql)).find(c => c.key === "meals")!;
  await assert.rejects(settings.updateCategory(sql, asMember(hugo), meals.id, { name: "x" }), refuses("forbidden"));
  const renamed = await settings.updateCategory(sql, asMember(camille), meals.id, { name: "Client meals", account: "625710", vatRecovery: "100", cap: "45,50" });
  assert.deepEqual([renamed.name, renamed.account, renamed.vatRecovery, renamed.cap], ["Client meals", "625710", 100, 4550]);
  assert.equal((await settings.updateCategory(sql, asMember(camille), meals.id, { name: "" })).name, null);
  await assert.rejects(settings.updateCategory(sql, asMember(camille), meals.id, { vatRecovery: 120 }), refuses("invalid"));
  await assert.rejects(settings.updateCategory(sql, asMember(camille), meals.id, { account: "=1+1" }), refuses("invalid"));
  await assert.rejects(settings.updateCategory(sql, asMember(camille), meals.id, { cap: "-3" }), refuses("amount_invalid"));
  const mileage = await settings.mileageCategory(sql);
  await assert.rejects(settings.updateCategory(sql, asMember(camille), mileage.id, { archived: true }), refuses("category_invalid"));
  const added = await settings.addCategory(sql, asMember(camille), { name: "Tolls", account: "625110", vatRecovery: 100 });
  await assert.rejects(settings.updateCategory(sql, asMember(camille), added.id, { name: "" }), refuses("empty"));
  await settings.updateCategory(sql, asMember(camille), added.id, { archived: true });
  assert.ok(!(await settings.categories(sql)).some(c => c.id === added.id));
  assert.ok((await settings.categories(sql, { archived: true })).some(c => c.id === added.id && c.archived));
  await assert.rejects(settings.addCategory(sql, asMember(camille), { name: "" }), refuses("empty"));
  await assert.rejects(settings.updateCategory(sql, asMember(camille), "999999", { name: "x" }), refuses("not_found"));
});

test("the scale of a year: its own, else the latest before, else the first after", async () => {
  const { sql } = database;
  assert.equal((await settings.scaleFor(sql, 2031)).year, 2025);
  assert.equal((await settings.scaleFor(sql, 2019)).year, 2025);
  const data = (await settings.scaleFor(sql, 2025)).data;
  await settings.saveScale(sql, asMember(camille), 2027, data, "impots.gouv.fr");
  assert.equal((await settings.scaleFor(sql, 2026)).year, 2025);
  assert.equal((await settings.scaleFor(sql, 2029)).year, 2027);
  await assert.rejects(settings.saveScale(sql, asMember(camille), 1999, data, ""), refuses("invalid"));
  await assert.rejects(settings.saveScale(sql, asMember(camille), 2028, { ...data, car: null }, ""), refuses("scale_invalid"));
});
