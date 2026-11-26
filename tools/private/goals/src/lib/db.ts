import type postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it: the package's
// db() (one pool per process, opened on first use, never at build time;
// date columns come back as "YYYY-MM-DD" text; every session in the
// Chest's time zone). Goals' services take the connection as their first
// argument (`Sql`), or a transaction (`Query`): the tests give theirs.
export { db } from "@argentic/chest-app/db";
export type Sql = postgres.Sql<{ date: string }>;
export type Query = Sql | postgres.TransactionSql<{ date: string }>;
