import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { listCategories } from "../src/lib/categories.ts";
import * as items from "../src/lib/items.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// Pages others change follow them (SDK 0.7.0 realtime, never a timer): the
// managers' pages through the feeds of chest.json (keys only), a member's
// own page through "mine.changed" on their own channel.

type Realtime = Exclude<NonNullable<Parameters<typeof fakeChest>[0]>["realtime"], undefined>;
const manifest = JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { capabilities: string[]; realtime: Realtime & { channels: { name: string; join?: string[] }[]; feeds: { table: string; channel: string; columns: string[] }[] } };

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: manifest.capabilities.filter(c => c !== "database"), realtime: manifest.realtime });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("the managers' channel is theirs alone; every feed names a table of the schema and only its primary key", async () => {
  assert.deepEqual(manifest.realtime.channels, [{ name: "managers", join: ["manager"] }, { name: "mine:{member}" }]);
  for (const feed of manifest.realtime.feeds) {
    const key = await database.sql<{ column: string }[]>`
      select a.attname as column from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ${feed.table}::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`;
    assert.deepEqual(feed.columns, key.map(k => k.column), feed.table);
    assert.equal(feed.channel, "managers");
  }
});

test("given something, or having it taken back, a member's own page is told — on their channel only", async () => {
  const { sql } = database;
  const M = asMember(camille);
  const cats = await listCategories(sql, M);
  const laptop = await items.createItem(sql, M, { categoryId: cats.find(c => c.key === "laptop")!.id, name: "ThinkPad" });
  const start = chest.realtime.published.length;
  await items.give(sql, M, laptop.id, { to: { member: hugo.id } });
  await items.takeBack(sql, M, laptop.id);
  const told = chest.realtime.published.slice(start).map(p => [p.channel, p.event]);
  assert.ok(told.length >= 2, "given, then taken back");
  assert.ok(told.every(([channel, event]) => channel === `mine:${hugo.id}` && event === "mine.changed"), JSON.stringify(told));
});
