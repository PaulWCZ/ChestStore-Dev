import type postgres from "postgres";

// The tool's own PostgreSQL database, as the Chest gives it: the package's
// pool (@argentic/chest-app/db: one per process, opened on first use, its
// sessions in the Chest's zone, date columns as "YYYY-MM-DD" text). The
// rules of src/lib/ take the connection they work with (`sql`): a page or
// an action passes db(), a test its own, a step of a transaction its tx.
export { db } from "@argentic/chest-app/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = postgres.Sql<any>;
// A connection or a transaction: what a step inside sql.begin receives.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Query = postgres.Sql<any> | postgres.TransactionSql<any>;
