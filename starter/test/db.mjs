import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

// A database for a test file: PostgreSQL in the test's own process
// (PGlite), served on 127.0.0.1 in the shape the Chest gives, so the tool's
// databaseUrl() and db() work unchanged; the migrations run as the Chest
// runs them (name order, each once). sql is a connection for the test's
// own checks.
export async function testDatabase() {
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 8 });
  await server.start();
  const port = server.server.address().port;
  process.env.DATABASE_URL = `postgres://t_test:test@127.0.0.1:${port}/t_test?sslmode=disable`;
  for (const file of readdirSync("migrations").filter(f => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  return { sql, async close() { await sql.end(); await server.stop(); await pg.close(); } };
}
