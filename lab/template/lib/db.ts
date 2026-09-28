import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it. One pool per
// server process, created on first use (never at build time); the Chest
// allows 10 connections per instance, two instances run during a switch.
export type Sql = postgres.Sql;

let pool: Sql | undefined;

export function db(): Sql {
  pool ??= postgres(databaseUrl(), { max: 4, idle_timeout: 30, connect_timeout: 10, onnotice: () => {} });
  return pool;
}

// provide makes db() answer a connection the tests opened (test/support/db.ts).
export function provide(sql: Sql | undefined): void {
  pool = sql;
}
