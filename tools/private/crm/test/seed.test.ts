import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { testDatabase, type TestDatabase } from "./support/db.ts";

let database: TestDatabase;
before(async () => { database = await testDatabase(); });
after(async () => { await database.close(); });

// The sample client book (screenshots, the dev harness) loads on the
// schema as it is.
test("seed/sample.sql loads: 10 companies, 15 contacts, 17 deals, next steps and history", async () => {
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
  const [row] = await database.sql`select (select count(*) from companies)::int as c, (select count(*) from contacts)::int as p, (select count(*) from deals)::int as d, (select count(*) from steps)::int as s`;
  assert.deepEqual({ ...row }, { c: 10, p: 15, d: 17, s: 13 });
});
