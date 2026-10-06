import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { provide } from "../../src/lib/db.ts";

// A fresh database for a test file, with the tool's migrations run as the
// Chest runs them (in name order, each in its own transaction, recorded in
// chest_migrations). With TEST_DATABASE_URL (a PostgreSQL server whose user
// may create databases), a new database on it, dropped at the end;
// otherwise PGlite, PostgreSQL in the test's process (a dev dependency
// only). DATABASE_URL is set in the shape the Chest gives, so databaseUrl()
// and lib/db.ts work unchanged; db()
// answers this very connection (PGlite takes one at a time). As a Chest
// does, the sessions are in the Chest's zone (current_date is its today):
// UTC, the fake Chest's default, unless the test gives the zone it gives
// fakeChest({chest: {timeZone}}).
export type TestDatabase = { sql: postgres.Sql; url: string; close(): Promise<void> };

const migrationsDir = join(import.meta.dirname, "..", "..", "migrations");

// migrate runs the migrations, or those up to a name (included): a test of
// a migration fills the schema before it, then runs the rest.
export async function migrate(sql: postgres.Sql, until?: string): Promise<void> {
  await sql`create table if not exists chest_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()) {
    if (until !== undefined && file > until) break;
    const done = await sql`select 1 from chest_migrations where name = ${file}`;
    if (done.length > 0) continue;
    const text = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async tx => {
      await tx.unsafe(text).simple();
      await tx`insert into chest_migrations (name, sha256) values (${file}, 'test')`;
    });
  }
}

export async function testDatabase(options: { until?: string; timeZone?: string } = {}): Promise<TestDatabase> {
  const zone = options.timeZone ?? "UTC";
  if (!/^[A-Za-z0-9_+\/-]+$/u.test(zone)) throw new Error("not a zone: " + zone);
  const server = process.env["TEST_DATABASE_URL"];
  if (server) {
    // The Chest's shape: a role t_<tool> owning its database (databaseUrl()
    // refuses any other, so the built server checks it too).
    const name = "t_test_" + Math.random().toString(36).slice(2, 10);
    const admin = postgres(server, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create role ${name} login password 'test'`);
    await admin.unsafe(`create database ${name} owner ${name}`);
    await admin.unsafe(`alter database ${name} set timezone to '${zone}'`);
    const base = new URL(server);
    const url = `postgres://${name}:test@127.0.0.1:${base.port || 5432}/${name}?sslmode=disable`;
    const sql = postgres(url, { max: 4, onnotice: () => {} });
    await migrate(sql, options.until);
    process.env["DATABASE_URL"] = url;
    provide(sql);
    return {
      sql,
      url,
      async close() {
        provide(undefined);
        await sql.end();
        await admin.unsafe(`drop database if exists ${name} with (force)`);
        await admin.unsafe(`drop role if exists ${name}`);
        await admin.end();
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { unaccent } = await import("@electric-sql/pglite/contrib/unaccent");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const pg = await PGlite.create({ extensions: { pg_trgm, unaccent, btree_gist } });
  // PGlite is one session, which every connection of the socket shares.
  await pg.exec(`set time zone '${zone}'`);
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1", maxConnections: 8 });
  await socket.start();
  const address = (socket as unknown as { server?: { address(): { port: number } } }).server?.address();
  const port = address?.port ?? 0;
  // The shape of the Chest's address (lib/db.ts checks it through the SDK).
  const url = `postgres://t_test:test@127.0.0.1:${port}/t_test?sslmode=disable`;
  // One connection for the built server too (src/lib/db.ts reads it):
  // PGlite is one session, two transactions at once would mix there.
  process.env["DATABASE_POOL_MAX"] = "1";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(sql, options.until);
  process.env["DATABASE_URL"] = url;
  provide(sql);
  return {
    sql,
    url,
    async close() {
      provide(undefined);
      await sql.end();
      await socket.stop();
      await pg.close();
    },
  };
}
