import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as deals from "../src/lib/deals.ts";
import { teamReport } from "../src/lib/reports.ts";
import { defaultCurrency, setDefaultCurrency } from "../src/lib/settings.ts";
import { minorUnits } from "../src/lib/share.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// SDK 0.7.0 has no Chest currency: each deal keeps its own code, a new one
// takes the team's default (a manager's setting, EUR until set), and the
// totals are in the default only — deals in another are counted, never
// added.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ network: {}, members: everyone });
  database = await testDatabase();
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the default currency: EUR, a manager's to change, a known code only", async () => {
  const { sql } = database;
  assert.equal(await defaultCurrency(sql), "EUR");
  await assert.rejects(setDefaultCurrency(sql, asMember(hugo), "USD"), { code: "forbidden" });
  await assert.rejects(setDefaultCurrency(sql, asMember(camille), "ZZZ"), { code: "invalid" });
  assert.equal(await setDefaultCurrency(sql, asMember(camille), "usd"), "USD");
  await setDefaultCurrency(sql, asMember(camille), "EUR");
});

test("deals keep their currency; totals add the default's only and count the others", async () => {
  const { sql } = database;
  await deals.addDeal(sql, asMember(hugo), { title: "In euros", value: 100000 });
  const usd = await deals.addDeal(sql, asMember(hugo), { title: "In dollars", value: 50000, currency: "USD" });
  assert.equal(usd.currency, "USD");
  await setDefaultCurrency(sql, asMember(camille), "GBP");
  const gbp = await deals.addDeal(sql, asMember(hugo), { title: "In pounds", value: 20000 });
  assert.equal(gbp.currency, "GBP");
  const all = await deals.listDeals(sql, asMember(hugo));
  assert.equal(all.value, 20000, "pounds only");
  assert.equal(all.others, 2);
  const report = await teamReport(sql, asMember(camille));
  assert.equal(report.currency, "GBP");
  assert.equal(report.others, 2);
  assert.equal(report.owners.reduce((n, o) => n + o.value, 0), 20000);
  await setDefaultCurrency(sql, asMember(camille), "EUR");
});

test("an event's amount is in the currency's own minor unit", () => {
  assert.equal(minorUnits(123456, "EUR"), 123456);
  assert.equal(minorUnits(123400, "JPY"), 1234);
  assert.equal(minorUnits(125000, "KWD"), 1250000);
});

test("the pages follow the realtime feeds: every feed a table of the schema, its primary key only", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { realtime: { channels: { name: string }[]; feeds: { table: string; channel: string; columns: string[] }[] } };
  assert.deepEqual(manifest.realtime.channels, [{ name: "team" }]);
  for (const feed of manifest.realtime.feeds) {
    const key = await database.sql<{ column: string }[]>`
      select a.attname as column from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ${feed.table}::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`;
    assert.deepEqual(feed.columns, key.map(k => k.column), feed.table);
  }
});
