import type { Query } from "./db.ts";

// transaction runs steps in one transaction, or inside the one the caller
// already opened.
export async function transaction<T>(sql: Query, steps: (tx: Query) => Promise<T>): Promise<T> {
  if ("begin" in sql && typeof sql.begin === "function") return (await sql.begin(tx => steps(tx))) as T;
  return steps(sql);
}
