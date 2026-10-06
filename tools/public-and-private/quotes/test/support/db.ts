import postgres from "postgres";
import { testDatabase as packageDatabase } from "@argentic/chest-app/testing";
import { closeDb, connectionOptions, db, type Sql } from "../../src/lib/db.ts";

// A fresh database for a test file: @argentic/chest-app's testDatabase()
// (the migrations played as the Chest plays them; TEST_DATABASE_URL first —
// a throwaway role and database —, else the preview's DATABASE_URL — a
// throwaway schema —, else PGlite in the process), and the tool's own pool
// on it (src/lib/db.ts: bigint amounts as numbers, the Chest's zone on
// every session). `sql` is that pool: the services and the tests read the
// same rows the same way. `url`: the database's address, for a test that
// opens connections of its own (numbering.test.ts: ten at once). A second
// database in the same file (import.test.ts) gets a pool of its own; db()
// stays on the first.
// Start fakeChest() first: the sessions run in its zone (CHEST_TIME_ZONE).
export type TestDatabase = { sql: Sql; url: string; close(): Promise<void> };

let opened = 0;
export async function testDatabase(): Promise<TestDatabase> {
  const made = await packageDatabase();
  const url = process.env["DATABASE_URL"] ?? "";
  const first = opened++ === 0;
  const zone = process.env["CHEST_TIME_ZONE"];
  const sql = first ? db() : (postgres(url, { max: 1, ...connectionOptions, ...(zone ? { connection: { TimeZone: zone } } : {}) }) as unknown as Sql);
  return {
    sql,
    url,
    async close() {
      if (first) await closeDb();
      else await sql.end();
      await made.close();
    },
  };
}
