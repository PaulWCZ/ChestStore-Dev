import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { comments } from "../src/lib/comments.ts";
import { lines } from "../src/lib/doc.ts";
import * as pages from "../src/lib/pages.ts";
import { search } from "../src/lib/search.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone });
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
  // Its conversation: comments, a template of Sales, a review due.
  assert.equal((await comments(sql, asMember(hugo), "2")).length, 3);
  assert.equal((await pages.page(sql, asMember(hugo), "18")).template, true);
  assert.equal((await pages.page(sql, asMember(hugo), "7")).review?.due, true);
  // New pages get ids after the sample's.
  const made = await pages.createPage(sql, asMember(camille), { spaceId: "1", title: "New" });
  assert.ok(Number(made.id) > 18);
});

// What people type into the handbook's search box, in English and in
// French: the page they mean comes first.
test("search finds what people type: Wi-Fi as wifi, words in any order, typos, French", async () => {
  const { sql } = database;
  const first = async (q: string) => (await search(sql, asMember(hugo), q))[0];
  const titles = async (q: string) => (await search(sql, asMember(hugo), q)).map(h => h.title.map(s => s.text).join(""));
  // The home page's own example.
  assert.equal((await first("wifi"))?.id, "5");
  assert.equal((await first("Wi-Fi"))?.id, "5");
  assert.equal((await first("wi-fi"))?.id, "5");
  assert.equal((await first("WIFI"))?.id, "5");
  // The passage marks the word as the page writes it.
  const hit = await first("wifi");
  assert.ok(hit!.title.some(s => s.hit && /wi/iu.test(s.text)), JSON.stringify(hit!.title));
  // Two words: the page holding both first, then pages holding one.
  const both = await titles("wifi password");
  assert.equal(both[0], "Wi-Fi and printers");
  assert.ok(both.includes("Password manager"), both.join(", "));
  assert.equal((await search(sql, asMember(hugo), "wifi password"))[0]?.complete, true);
  assert.equal((await first("password wifi"))?.id, "5");
  // Typos, by the nearest word the wiki holds.
  assert.equal((await first("pasword manager"))?.id, "6");
  assert.equal((await first("printres"))?.id, "5");
  assert.equal((await first("teletravial"))?.id, "9");
  // French, accents aside, hyphens either way.
  assert.equal((await first("télétravail"))?.id, "9");
  assert.equal((await first("rendez vous client"))?.id, "12");
  assert.equal((await first("rendezvous"))?.id, "12");
  assert.equal((await first("reglement interieur"))?.id, "8");
  // A word nobody wrote finds nothing rather than anything.
  assert.deepEqual(await search(sql, asMember(hugo), "zxqvbn"), []);
  // Nothing from a space the reader does not see, even by a typo.
  assert.ok(!(await search(sql, asMember(hugo), "salry review")).some(h => h.id === "16"));
});
