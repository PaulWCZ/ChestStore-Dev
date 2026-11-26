import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { fakeChest } from "@argentic/chest-sdk/testing";
import { changeStamp, forgetChanges } from "../dist/db.js";
import { testDatabase } from "../dist/testing.js";

// changeStamp() under concurrency, on a real PostgreSQL (two sessions; a
// PGlite database is one session: skipped there).
let chest, database, other;
before(async () => {
  chest = await fakeChest({});
  if (skip()) return;
  database = await testDatabase({ migrations: "test/no-migrations" });
  await database.sql.unsafe(readFileSync(new URL("../sql/changes.sql", import.meta.url), "utf8")).simple();
  await database.sql`create table deals (id bigint primary key generated always as identity, name text not null)`;
  await database.sql`select chest_watch('deals')`;
  other = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
});
after(async () => {
  await other?.end();
  await database?.close();
  await chest.close();
});
const skip = () => !process.env.TEST_DATABASE_URL && "needs a PostgreSQL server (TEST_DATABASE_URL)";
const stamp = () => changeStamp(database.sql);

test("a statement that changes nothing does not move the stamp; one that does, once per transaction", { skip: skip() }, async () => {
  const before = await stamp();
  await database.sql`delete from deals where id < 0`;
  await database.sql`update deals set name = name where false`;
  assert.equal(await stamp(), before, "empty statements");
  await database.sql.begin(async tx => {
    await tx`insert into deals (name) values ('a')`;
    await tx`insert into deals (name) values ('b')`;
    await tx`update deals set name = name || '!'`;
  });
  assert.equal(Number(await stamp()), Number(before) + 1, "one transaction, one change");
  await database.sql.begin(async tx => {
    await tx`insert into deals (name) values ('c')`;
    await tx.savepoint(async sp => { await sp`delete from deals`; throw new Error("undo"); }).catch(() => {});
  });
  assert.equal(Number(await stamp()), Number(before) + 2);
});

test("a write still uncommitted while a page is read: after its commit the stamp has moved (no stale 304)", { skip: skip() }, async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let inserted;
  const done = new Promise(resolve => { inserted = resolve; });
  const writer = other.begin(async tx => {
    await tx`insert into deals (name) values ('import')`;
    inserted();
    await held;
  });
  await done;
  const read = await stamp(); // the page's version, read before it renders the old rows
  const rows = await database.sql`select count(*)::int as n from deals where name = 'import'`;
  assert.equal(rows[0].n, 0, "the reader sees the old rows");
  release();
  await writer;
  assert.notEqual(await stamp(), read, "the next refresh renders again");
});

test("two writers committing out of order: each commit moves the stamp", { skip: skip() }, async () => {
  const third = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    let releaseA, insertedA;
    const heldA = new Promise(r => { releaseA = r; }), doneA = new Promise(r => { insertedA = r; });
    const a = other.begin(async tx => { await tx`insert into deals (name) values ('first')`; insertedA(); await heldA; }); // the lower log id
    await doneA;
    await third.begin(async tx => { await tx`insert into deals (name) values ('second')`; }); // commits first
    const between = await stamp();
    releaseA();
    await a;
    assert.notEqual(await stamp(), between, "the late, lower id still counts");
  } finally {
    await third.end();
  }
});

test("a 5,000-row import beside another write: no wait, and fast", { skip: skip() }, async () => {
  let releaseImport, imported;
  const held = new Promise(r => { releaseImport = r; }), rowsIn = new Promise(r => { imported = r; });
  const started = performance.now();
  const importing = other.begin(async tx => {
    for (let i = 0; i < 5000; i++) await tx`insert into deals (name) values (${"row " + i})`;
    imported();
    await held;
  });
  await rowsIn;
  const importTime = performance.now() - started;
  const t0 = performance.now();
  await database.sql`insert into deals (name) values ('meanwhile')`;
  const waited = performance.now() - t0;
  releaseImport();
  await importing;
  assert.ok(waited < 500, `the other write waited ${Math.round(waited)} ms`);
  assert.ok(importTime < 30_000, `the import took ${Math.round(importTime)} ms`);
  console.log(`import of 5,000 rows: ${Math.round(importTime)} ms; a write beside it: ${Math.round(waited)} ms`);
});

test("forgetChanges() folds the old rows without moving the stamp", { skip: skip() }, async () => {
  await database.sql`update chest_changes set at = now() - interval '2 days'`;
  const before = await stamp();
  await forgetChanges(database.sql);
  assert.equal((await database.sql`select count(*)::int as n from chest_changes`)[0].n, 0);
  assert.equal(await stamp(), before);
  await database.sql`insert into deals (name) values ('after')`;
  assert.equal(Number(await stamp()), Number(before) + 1);
});
