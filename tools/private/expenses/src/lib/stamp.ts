import { changeStamp } from "@argentic/chest-app/db";
import type { Query } from "./db.ts";

// A page's version (page(render, { version })): the package's change stamp
// of the tables the pages read (migrations/0006: right under concurrent
// writes, unmoved by a statement that changes nothing), the day and the
// quarter hour (what is due, "waiting
// for 3 days") — a few characters. The package keys it by reader,
// language and address; the names of people come from the Chest and
// follow at the next quarter hour at the latest.
export async function stamp(sql: Query, today: string, at = new Date()): Promise<string> {
  return `${await changeStamp(sql as Parameters<typeof changeStamp>[0])}.${today}.${Math.floor(at.getTime() / 900_000)}`;
}
