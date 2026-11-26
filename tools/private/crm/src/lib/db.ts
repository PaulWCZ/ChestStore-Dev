import type postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it: the package's
// db() (one pool per process, opened on first use, never at build time;
// date columns as "YYYY-MM-DD" text, the session in the Chest's time zone).
// The services take the connection as their first argument (`Sql`), or a
// transaction (`Query`), so a test or a schedule gives its own.
export { db } from "@argentic/chest-app/db";
export type Sql = postgres.Sql<{ date: string }>;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = Sql | postgres.TransactionSql<{ date: string }>;
export type TransactionSql = postgres.TransactionSql<{ date: string }>;
