import { join } from "node:path";
import { testDatabase as packageDatabase } from "@argentic/chest-app/testing";

// A fresh database for a test file, with the tool's migrations run as the
// Chest runs them (the package's testDatabase: TEST_DATABASE_URL first — a
// server whose user may create roles —, then the preview's database, then
// PGlite in the process). Start fakeChest() first: the database's sessions
// run in the Chest's zone. Its `sql` is the test's own connection; the
// tool's db() opens its own pool on the same database.
export type TestDatabase = Awaited<ReturnType<typeof packageDatabase>>;
export const testDatabase = () => packageDatabase({ migrations: join(import.meta.dirname, "..", "..", "migrations") });
