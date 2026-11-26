import type postgres from "postgres";
import { db } from "@argentic/chest-app/db";

// The tool's own PostgreSQL database, as the Chest gives it: the package's
// pool (@argentic/chest-app/db: opened on first use, never at build time).
// Every service takes the connection (or a transaction) as its first
// argument, so the tests give theirs. Calendar days come out as
// "YYYY-MM-DD" (the services write to_char() anyway), bigint as text.
export { db };
export type Sql = postgres.Sql<any>;
// A connection or a transaction: what a step inside sql.begin receives.
export type Query = postgres.Sql<any> | postgres.TransactionSql<any>;
