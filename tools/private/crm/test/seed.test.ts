import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { testDatabase, type TestDatabase } from "./support/db.ts";

// The fake Chest first: its zone is the database session's (the seed's
// current_date is the company's day).
let database: TestDatabase;
let chest: FakeChest;
before(async () => { chest = await fakeChest({ network: {} }); database = await testDatabase(); });
after(async () => { await database.close(); await chest.close(); });

// The sample client book (screenshots, the dev harness) loads on the
// schema as it is.
test("seed/sample.sql loads: 11 companies, 17 contacts (two leads from a form), 17 deals, next steps and history", async () => {
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  const [row] = await database.sql`select (select count(*) from companies)::int as c, (select count(*) from contacts)::int as p, (select count(*) from deals)::int as d, (select count(*) from steps)::int as s`;
  assert.deepEqual({ ...row }, { c: 11, p: 17, d: 17, s: 13 });
  const [leads] = await database.sql`select count(*)::int as n, count(maybe_same)::int as maybe from contacts where lead_since is not null and owner is null`;
  assert.deepEqual({ ...leads }, { n: 2, maybe: 1 });
});
