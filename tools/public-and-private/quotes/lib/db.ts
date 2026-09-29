import { databaseUrl } from "@argentic/chest-sdk/database";
import postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it. One pool per
// server process, created on first use (never at build time); the Chest
// allows 10 connections per instance, two instances run during a switch.
export type Sql = postgres.Sql;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = postgres.Sql | postgres.TransactionSql;

let pool: Sql | undefined;

// How rows come back: a calendar day (date) as its text "2026-09-28", never
// a Date in the server's zone; a bigint (money in cents, ids) as a number —
// every amount the tool keeps is bounded far below 2^53 (lib/model.ts).
export const connectionOptions = {
  onnotice: () => {},
  types: {
    day: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    int8: { to: 20, from: [20], serialize: (x: number | bigint | string) => String(x), parse: (x: string) => Number(x) },
  },
};

export function db(): Sql {
  pool ??= postgres(databaseUrl(), { max: 4, idle_timeout: 30, connect_timeout: 10, ...connectionOptions }) as unknown as Sql;
  return pool;
}

// provide makes db() answer a connection the tests opened (test/support/db.ts).
export function provide(sql: Sql | undefined): void {
  pool = sql;
}
