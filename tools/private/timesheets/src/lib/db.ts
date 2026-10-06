import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it. One pool per
// server process, created on first use (never at build time); the Chest
// allows 10 connections per instance, two instances run during a switch.
export type Sql = postgres.Sql;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = postgres.Sql | postgres.TransactionSql;

let pool: Sql | undefined;

// DATABASE_POOL_MAX (1 to 10, 4 by default): the tests set 1 on PGlite,
// which serves every connection from one session (two transactions at
// once would mix there).
export function db(): Sql {
  const max = Number(process.env["DATABASE_POOL_MAX"]);
  pool ??= postgres(databaseUrl(), { max: Number.isInteger(max) && max >= 1 && max <= 10 ? max : 4, idle_timeout: 30, connect_timeout: 10, onnotice: () => {} });
  return pool;
}

// provide makes db() answer a connection the tests opened (test/support/db.ts).
export function provide(sql: Sql | undefined): void {
  pool = sql;
}
