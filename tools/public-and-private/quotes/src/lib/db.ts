import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it. One pool per
// server process, opened on first use (never at build time or import).
// Services take the connection (or a transaction) as their first argument.
//
// Quotes keeps its own pool rather than @argentic/chest-app/db's: money is
// integers of cents in bigint columns, and every amount the tool keeps is
// bounded far below 2^53 (src/lib/model.ts, `limits`), so a bigint comes
// back as a number here — the totals' rule (src/lib/totals.ts) works on
// numbers end to end, never on text. Calendar days (date) come back as
// their text "2026-09-28", never a Date in the server's zone. The rest
// follows the package's db(): the Chest's zone on every session
// (CHEST_TIME_ZONE: current_date is the company's day), DATABASE_POOL_MAX
// (1 to 10, 4 by default; the tests set 1 on PGlite), and the throwaway
// schema of a test run in a Perseus preview (TEST_DATABASE_SCHEMA). The
// package's own pool still serves what the package keeps (chest_seen,
// chest_bounds): at most 8 connections a process, under the Chest's 10.
export type Sql = postgres.Sql;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = postgres.Sql | postgres.TransactionSql;

export const connectionOptions = {
  onnotice: () => {},
  types: {
    day: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    int8: { to: 20, from: [20], serialize: (x: number | bigint | string) => String(x), parse: (x: string) => Number(x) },
  },
};

let pool: Sql | undefined;

function poolMax(): number {
  const max = Number(process.env["DATABASE_POOL_MAX"]);
  return Number.isInteger(max) && max >= 1 && max <= 10 ? max : 4;
}

export function db(): Sql {
  if (pool) return pool;
  const schema = process.env["TEST_DATABASE_SCHEMA"];
  const zone = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/u.test(process.env["CHEST_TIME_ZONE"] ?? "") ? process.env["CHEST_TIME_ZONE"] : undefined;
  pool = postgres(databaseUrl(), {
    max: poolMax(),
    idle_timeout: 60,
    connect_timeout: 10,
    ...connectionOptions,
    connection: { ...(schema ? { search_path: schema } : {}), ...(zone ? { TimeZone: zone } : {}) },
  }) as unknown as Sql;
  return pool;
}

// The tests' own databases (test/support/db.ts): the pool is closed and
// forgotten when a test file's database goes, so the next one opens on
// the new DATABASE_URL.
export async function closeDb(): Promise<void> {
  const open = pool;
  pool = undefined;
  await open?.end();
}
