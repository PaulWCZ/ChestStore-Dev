import type postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it: the
// package's db() (one pool per process, opened on first use, never at
// build time). The wiki's services take the connection as their first
// argument (`Sql`), or a transaction (`Query`).
export { db } from "@argentic/chest-app/db";
export type Sql = postgres.Sql<{ date: string }>;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = Sql | postgres.TransactionSql<{ date: string }>;
// A piece of a query, put inside another.
export type Fragment = postgres.Fragment;
// A value for a jsonb column (a page's document).
export const json = (value: object): postgres.JSONValue => value as postgres.JSONValue;
