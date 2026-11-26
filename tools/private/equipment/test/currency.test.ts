import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type postgres from "postgres";
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

// A Chest that ran Equipment before 0.7.0 kept its amounts in hundredths
// of the Chest's currency, a currency Equipment never wrote down: 0009
// takes them for euros, 0010 marks them guessed — and nothing else.
test("an upgrade from 0.4: the amounts already written are guessed EUR, the new ones are not", async () => {
  const dir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const run = async (s: postgres.ReservedSql, names: string[]) => { for (const f of names) await s.unsafe(readFileSync(new URL(f, dir), "utf8")).simple(); };
  const s = await (database.sql as unknown as postgres.Sql).reserve();
  try {
    await s.unsafe("create schema upgrade; set search_path to upgrade");
    await run(s, files.filter(f => f < "0009"));
    const [cat] = await s`select id from categories where key = 'laptop'`;
    const [item] = await s`insert into items (category_id, tag, name, price_cents, created_by) values (${cat!["id"]}, 'OLD-1', 'Old laptop', 129990, ${camille.id}) returning id`;
    await s`insert into items (category_id, tag, name, created_by) values (${cat!["id"]}, 'OLD-2', 'No price', ${camille.id})`;
    await s`insert into history (item_id, actor, kind, status, cost_cents) values (${item!["id"]}, ${camille.id}, 'status', 'in_stock', 4550)`;
    await run(s, files.filter(f => f >= "0009"));
    assert.deepEqual((await s`select tag, currency, currency_guessed as g from items order by tag`).map(r => [r["tag"], r["currency"], r["g"]]), [["OLD-1", "EUR", true], ["OLD-2", null, false]]);
    assert.deepEqual((await s`select currency, currency_guessed as g from history where cost_cents is not null`).map(r => [r["currency"], r["g"]]), [["EUR", true]]);
    assert.equal((await s`select currency_guessed as g from settings`)[0]!["g"], true);
    // The history stays append-only: a guessed row may only become known.
    await assert.rejects(s`update history set cost_cents = 1 where cost_cents is not null`);
    await s`update history set currency_guessed = false where cost_cents is not null`;
    await assert.rejects(s`update history set currency_guessed = true where cost_cents is not null`);
  } finally {
    await s.unsafe("set search_path to public; drop schema upgrade cascade");
    s.release();
  }
});

test("the first currency a manager saves is the one of the guessed amounts, read in its minor unit; once only", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const laptop = cats.find(c => c.key === "laptop")!.id;
  // As 0010 leaves a populated database: amounts in hundredths, guessed EUR.
  const old = await items.createItem(sql, M, { categoryId: laptop, name: "Guessed laptop", price: "1299.90", currency: "EUR" });
  const kept = await items.createItem(sql, M, { categoryId: laptop, name: "Known laptop", price: "999", currency: "EUR" });
  const edited = await items.createItem(sql, M, { categoryId: laptop, name: "Edited laptop", price: "500", currency: "EUR" });
  await sql`update items set currency_guessed = true where id in (${old.id}, ${edited.id})`;
  await items.setStatus(sql, M, old.id, "in_repair", "", { ref: "R-9" });
  await items.setStatus(sql, M, old.id, "in_stock", "", { cost: "45.50" });
  await sql`update settings set currency_guessed = true`;
  // A cost recorded on a guessed item is guessed with it.
  assert.deepEqual((await sql`select currency_guessed as g from history where item_id = ${old.id} and cost_cents is not null`).map(r => r["g"]), [true]);
  // Edited with a new price: no longer guessed. Renamed only: still guessed.
  await items.updateItem(sql, M, edited.id, { categoryId: laptop, name: "Edited laptop", price: "550" });
  await items.updateItem(sql, M, old.id, { categoryId: laptop, name: "Guessed laptop, renamed", price: "1299.90" });
  await setDefaultCurrency(sql, M, "JPY");
  const all = await items.listItems(sql, M);
  const of = (id: string) => all.find(i => i.id === id)!;
  assert.deepEqual([of(old.id).priceCents, of(old.id).currency], [1300, "JPY"], "1299.90 in hundredths is ¥1,300");
  assert.deepEqual([of(kept.id).priceCents, of(kept.id).currency], [99900, "EUR"], "written after the upgrade: kept");
  assert.deepEqual([of(edited.id).priceCents, of(edited.id).currency], [55000, "EUR"], "corrected by hand: kept");
  assert.deepEqual(await items.repairCosts(sql, old.id), { count: 1, totals: [{ currency: "JPY", cents: 46 }] });
  // Saved again: nothing guessed is left, nothing moves.
  await setDefaultCurrency(sql, M, "KWD");
  assert.deepEqual([(await items.listItems(sql, M)).find(i => i.id === old.id)!.priceCents], [1300]);
  assert.deepEqual((await sql`select currency_guessed as g from settings`).map(r => r["g"]), [false]);
});
