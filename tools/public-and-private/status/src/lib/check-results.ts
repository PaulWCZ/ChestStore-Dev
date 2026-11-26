import type { CheckResult } from "@argentic/chest-sdk/checks";
import { record } from "./checks.ts";
import type { Sql } from "./db.ts";
import { checkChanged } from "./tell.ts";

// One result from the Chest: kept once, and when it changes where the
// component stands (down after three failures, up again), the editors are
// told.
export async function receive(sql: Sql, result: CheckResult): Promise<void> {
  const change = await record(sql, result);
  if (!change) return;
  const [row] = await sql<{ name: string }[]>`select name from components where id = ${change.componentId}`;
  await checkChanged(change, row?.name ?? "");
}
