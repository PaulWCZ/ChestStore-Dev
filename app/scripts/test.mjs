// npm test: the tests on a PostgreSQL server when one answers here (the
// studio's local one, unless TEST_DATABASE_URL names another), PGlite
// otherwise (1.2 GiB: the last resort).
import { execFileSync, spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.TEST_DATABASE_URL) {
  try {
    execFileSync("pg_isready", ["-h", "127.0.0.1", "-p", "5432"], { stdio: "ignore" });
    env.TEST_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/postgres";
  } catch { /* no local server: PGlite */ }
}
const run = spawnSync(process.execPath, ["--test", "--test-force-exit", "--test-concurrency=1", "test/units.test.ts", "test/server.test.mjs"], { stdio: "inherit", env });
process.exit(run.status ?? 1);
