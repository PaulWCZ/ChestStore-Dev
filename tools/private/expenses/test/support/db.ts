import { testDatabase as packageDatabase, type TestDatabase as PackageDatabase } from "@argentic/chest-app/testing";
import type postgres from "postgres";

// A fresh database for a test file, the tool's migrations played as the
// Chest plays them (@argentic/chest-app/testing: TEST_DATABASE_URL — a
// throwaway database on a real PostgreSQL —, else PGlite in the process).
// DATABASE_URL is set in the shape the Chest gives, so the built server's
// db() reaches the same database; the services under test take `sql`.
export type TestDatabase = { sql: postgres.Sql<any>; kind: PackageDatabase["kind"]; close(): Promise<void> };

export async function testDatabase(): Promise<TestDatabase> {
  return packageDatabase();
}
