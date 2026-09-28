import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { lines } from "../lib/doc.ts";
import * as pages from "../lib/pages.ts";
import { search } from "../lib/search.ts";
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

test("the sample handbook loads on the migrated schema and reads back", async () => {
  const { sql } = database;
  await sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  const welcome = await pages.page(sql, asMember(hugo), "1");
  assert.equal(welcome.title, "Welcome to Lumen & Co");
  assert.ok(lines(welcome.doc).length > 10);
  // The People space is kept to the office group: Hugo (sales) does not see it.
  await assert.rejects(pages.page(sql, asMember(hugo), "16"), /not_found/u);
  assert.equal((await pages.page(sql, asMember(camille), "16")).title, "Salary review");
  assert.equal((await search(sql, asMember(hugo), "teletravail"))[0]?.id, "9");
  // New pages get ids after the sample's.
  const made = await pages.createPage(sql, asMember(camille), { spaceId: "1", title: "New" });
  assert.ok(Number(made.id) > 17);
});
