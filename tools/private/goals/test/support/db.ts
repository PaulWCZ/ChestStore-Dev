import { testDatabase as packaged } from "@argentic/chest-app/testing";
import { db, type Sql } from "../../src/lib/db.ts";

// A fresh database for a test file, with the tool's migrations run in name
// order (@argentic/chest-app/testing): TEST_DATABASE_URL (a PostgreSQL
// server whose user may create roles: a database of its own, dropped at
// the end), else the preview's DATABASE_URL (a schema of its own), else
// PGlite in the test's process. Start fakeChest() first: the sessions are
// in the Chest's zone, as on a Chest. `sql` is the tool's own db() — the
// connection the services and the built server use, with its date parser.
export type TestDatabase = { sql: Sql; kind: "server" | "preview" | "pglite"; close(): Promise<void> };

export async function testDatabase(): Promise<TestDatabase> {
  const made = await packaged();
  const sql = db();
  return {
    sql,
    kind: made.kind,
    async close() {
      await sql.end();
      await made.close();
    },
  };
}
