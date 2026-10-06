import { testDatabase as packageDatabase } from "@argentic/chest-app/testing";
import type { Sql } from "../../src/lib/db.ts";

// A fresh database for a test file, the migrations played as the Chest
// plays them (the package's testDatabase: TEST_DATABASE_URL, a throwaway
// role and database on that server; else PGlite in the test's process,
// with the unaccent and pg_trgm extensions the wiki's migrations create).
// DATABASE_URL is set in the shape the Chest gives, so the package's db()
// (src/lib/db.ts) opens its own pool to it, unchanged. The wiki has no
// date column: its services take this connection as it is.
export type TestDatabase = { sql: Sql; close(): Promise<void> };

export async function testDatabase(): Promise<TestDatabase> {
  const made = await packageDatabase({ extensions: ["unaccent", "pg_trgm"] });
  return { sql: made.sql as unknown as Sql, close: () => made.close() };
}
