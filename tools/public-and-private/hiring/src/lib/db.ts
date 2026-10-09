import { db } from "@argentic/chest-app/db";
import type postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it: the package's
// pool (one per process, opened on first use, never at build time; every
// session in the Chest's time zone; a date column read as "YYYY-MM-DD").
// Rules take it as their first argument (db() from a route, a transaction
// inside sql.begin), so a test hands them the same.
export { db };
export type Sql = ReturnType<typeof db>;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = Sql | postgres.TransactionSql<{ date: string }>;
