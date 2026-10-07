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
// answers this very connection (PGlite takes one at a time).
export type TestDatabase = { sql: postgres.Sql; url: string; close(): Promise<void> };

const migrationsDir = join(import.meta.dirname, "..", "..", "migrations");

export async function migrate(sql: postgres.Sql): Promise<void> {
  await sql`create table if not exists chest_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`;
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()) {
    const done = await sql`select 1 from chest_migrations where name = ${file}`;
    if (done.length > 0) continue;
    const text = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async tx => {
      await tx.unsafe(text).simple();
      await tx`insert into chest_migrations (name, sha256) values (${file}, 'test')`;
    });
  }
}

export async function testDatabase(): Promise<TestDatabase> {
  const server = process.env["TEST_DATABASE_URL"];
  if (server) {
    // A role and a database of the same name, as the Chest gives them
    // (t_<tool>, the address databaseUrl() accepts): the built server of
    // test/app.test.mjs connects with it.
    const name = "t_test_" + Math.random().toString(36).slice(2, 10);
    const admin = postgres(server, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create role ${name} login password 'test'`);
    // The Chest sets its time zone as the role's own (contract 0.4:
    // CHEST_TIME_ZONE "is also its database role's timezone"), so every
    // session — the tool's pool, @argentic/chest-app's, the test's — has
    // the company's current_date. Without it the test's session would count
    // in the server's zone while the server counts in the Chest's: a
    // different day for an hour or two each evening. The zone is the fake
    // Chest's when it started first (CHEST_TIME_ZONE), else UTC, the Chest's
    // own default.
    const zone = process.env["CHEST_TIME_ZONE"] ?? "";
    await admin.unsafe(`alter role ${name} set timezone = '${/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/u.test(zone) ? zone : "UTC"}'`);
    await admin.unsafe(`create database ${name} owner ${name}`);
    const base = new URL(server);
    const url = `postgres://${name}:test@127.0.0.1:${base.port || 5432}/${name}?sslmode=disable`;
    const sql = postgres(url, { max: 4, onnotice: () => {} });
    await migrate(sql);
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
  // Several connections: the built server (test/app.test.mjs) opens its own pool.
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1", maxConnections: 8 });
  await socket.start();
  const address = (socket as unknown as { server?: { address(): { port: number } } }).server?.address();
  const port = address?.port ?? 0;
  // The shape of the Chest's address (lib/db.ts checks it through the SDK).
  const url = `postgres://t_test:test@127.0.0.1:${port}/t_test?sslmode=disable`;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(sql);
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
