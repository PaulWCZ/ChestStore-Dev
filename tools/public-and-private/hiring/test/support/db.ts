import { testDatabase as packaged } from "@argentic/chest-app/testing";
import { db, type Sql } from "../../src/lib/db.ts";

// A fresh database for a test file, with the tool's migrations played as
// the Chest plays them (the package's testDatabase: TEST_DATABASE_URL, a
// throwaway role and database on a PostgreSQL server; else PGlite in the
// process). sql is the tool's own pool (src/lib/db.ts: dates as
// "YYYY-MM-DD", the Chest's zone), the one its rules are given.
export type TestDatabase = { sql: Sql; close(): Promise<void> };

export async function testDatabase(): Promise<TestDatabase> {
  // The seeds' current_date is the Chest's day (a fake Chest started after
  // sets the same zone).
  process.env["CHEST_TIME_ZONE"] ??= "Europe/Paris";
  const made = await packaged({ extensions: ["pg_trgm", "unaccent", "btree_gist"] });
  return { sql: db(), close: () => made.close() };
}
