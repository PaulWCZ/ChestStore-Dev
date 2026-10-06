import type { Query } from "./db.ts";

// A page's version (page(render, { version })): the last change of the
// tables the pages read (change_stamp, bumped by every write:
// migrations/0006), the day and the quarter hour (what is due, "waiting
// for 3 days") — a few characters. The package keys it by reader,
// language and address; the names of people come from the Chest and
// follow at the next quarter hour at the latest.
export async function stamp(sql: Query, today: string, at = new Date()): Promise<string> {
  const [row] = await sql<{ n: string; called: boolean }[]>`select last_value::text as n, is_called as called from change_stamp`;
  return `${row?.called ? row.n : "0"}.${today}.${Math.floor(at.getTime() / 900_000)}`;
}
