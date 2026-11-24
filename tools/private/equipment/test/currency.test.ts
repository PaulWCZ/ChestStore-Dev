import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "@argentic/chest-app";
import { listCategories } from "../src/lib/categories.ts";
import { toCsv } from "../src/lib/csv.ts";
import { exportRows } from "../src/lib/export.ts";
import { applyImport } from "../src/lib/importer.ts";
import * as items from "../src/lib/items.ts";
import { defaultCurrency, setDefaultCurrency } from "../src/lib/settings.ts";
import { catalogue } from "../src/i18n/index.ts";
import { moneyText } from "../src/i18n/format.ts";
import { currencyCode, money } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// SDK 0.7.0 has no Chest currency: every amount keeps its own ISO 4217 code
// beside it, the tool keeps a default of its own (EUR until a manager
// changes it) for new amounts, and totals never add two currencies.

let database: TestDatabase;
let chest: FakeChest;
const M = asMember(camille);
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});
const refused = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => e instanceof AppError && e.code === code);

test("money is read in its currency's minor unit; a currency is a known ISO 4217 code", () => {
  assert.equal(money("1 299,90"), 129990);
  assert.equal(money("1299", 0), 1299);
  assert.equal(money("1,299", 0), 1299, "thousands, not decimals, for the yen");
  assert.equal(money("1.250", 3), 1250, "three decimals: a Kuwaiti dinar and a quarter");
  assert.throws(() => money("12.5", 0), (e: unknown) => e instanceof AppError && e.code === "invalid_money");
  assert.equal(currencyCode(" usd "), "USD");
  assert.equal(currencyCode(""), null);
  assert.throws(() => currencyCode("XYZ1"), (e: unknown) => e instanceof AppError && e.code === "invalid_currency");
  assert.equal(moneyText(129990, "EUR", "en"), "€1,299.90");
  assert.match(moneyText(1299, "JPY", "en"), /^(JP)?¥1,299$/u, "no decimals for the yen");
});

test("the tool's default currency: EUR until a manager sets another; a member may not; an unknown code is refused", async () => {
  const { sql } = database;
  assert.equal(await defaultCurrency(sql), "EUR");
  await refused(setDefaultCurrency(sql, asMember(hugo), "USD"), "forbidden");
  await refused(setDefaultCurrency(sql, M, "EURO"), "invalid_currency");
  await refused(setDefaultCurrency(sql, M, ""), "invalid_currency");
  assert.equal(await setDefaultCurrency(sql, M, "gbp"), "GBP");
  assert.equal(await defaultCurrency(sql), "GBP");
});

test("each item keeps its own currency: the default for a new one, another chosen, kept when edited without one", async () => {
  const { sql } = database;
  await setDefaultCurrency(sql, M, "GBP");
  const cats = await listCategories(sql, M);
  const laptop = cats.find(c => c.key === "laptop")!.id;
  const inGbp = await items.createItem(sql, M, { categoryId: laptop, name: "Dell XPS", price: "1499.00" });
  assert.deepEqual([inGbp.priceCents, inGbp.currency], [149900, "GBP"]);
  const inYen = await items.createItem(sql, M, { categoryId: laptop, name: "Let's note", price: "180000", currency: "JPY" });
  assert.deepEqual([inYen.priceCents, inYen.currency], [180000, "JPY"]);
  const none = await items.createItem(sql, M, { categoryId: laptop, name: "Old one" });
  assert.equal(none.currency, null, "no amount, no currency");
  // The default changes: the amounts already written keep theirs.
  await setDefaultCurrency(sql, M, "EUR");
  const again = await items.updateItem(sql, M, inYen.id, { categoryId: laptop, name: "Let's note SV", price: "175000" });
  assert.deepEqual([again.priceCents, again.currency], [175000, "JPY"]);
  const gbp = (await items.listItems(sql, M)).find(i => i.id === inGbp.id)!;
  assert.equal(gbp.currency, "GBP");
  // A member never reads money nor its currency.
  const brief = await items.itemDetail(sql, asMember(hugo), inGbp.id);
  assert.equal(brief.full, false);
});

test("repairs cost one total per currency, never added across; the export names each item's", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const phone = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "phone")!.id, name: "Pixel", price: "600", currency: "USD" });
  await items.setStatus(sql, M, phone.id, "in_repair", "", { ref: "R-1" });
  await items.setStatus(sql, M, phone.id, "in_stock", "", { cost: "80" });
  await items.setStatus(sql, M, phone.id, "in_repair", "", { ref: "R-2" });
  await items.setStatus(sql, M, phone.id, "in_stock", "", { cost: "50", currency: "EUR" });
  assert.deepEqual(await items.repairCosts(sql, phone.id), { count: 2, totals: [{ currency: "EUR", cents: 5000 }, { currency: "USD", cents: 8000 }] });
  const t = catalogue("en");
  const rows = exportRows((await items.listItems(sql, M)).filter(i => i.id === phone.id), t, () => "");
  const header = rows[0] as string[];
  const row = rows[1] as string[];
  assert.equal(row[header.indexOf(t.export.headers.price)], "600.00");
  assert.equal(row[header.indexOf(t.export.headers.currency)], "USD");
});

test("an import reads each row's currency, else the default; its amounts in that currency's unit", async () => {
  const { sql } = database;
  await setDefaultCurrency(sql, M, "CHF");
  const text = toCsv([["Asset Tag", "Name", "Category", "Purchase Cost", "Currency"], ["IMP-1", "Yen laptop", "Laptops", "200000", "JPY"], ["IMP-2", "Swiss laptop", "Laptops", "1500.50", ""]]);
  const done = await applyImport(sql, M, "csv", text);
  assert.equal(done.imported, 2);
  const all = await items.listItems(sql, M);
  const yen = all.find(i => i.tag === "IMP-1")!, chf = all.find(i => i.tag === "IMP-2")!;
  assert.deepEqual([yen.priceCents, yen.currency], [200000, "JPY"]);
  assert.deepEqual([chf.priceCents, chf.currency], [150050, "CHF"]);
});
