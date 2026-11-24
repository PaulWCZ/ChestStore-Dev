import { changeStamp } from "@argentic/chest-app/db";
import type { Query } from "./db.ts";

// A page's version (page(render, { version })): the package's change stamp
// of the tables the pages read (migrations/0006: right under concurrent
// writes, unmoved by a statement that changes nothing), the day and the
// quarter hour (what is due, "waiting
// for 3 days") — a few characters. The package keys it by reader,
// language and address; the names of people come from the Chest and
// follow at the next quarter hour at the latest.
// exits: how many times the member was taken out of their desk's live
// channel (lib/live.ts, migration 0008's live_out) — part of a live page's
// version, so a page whose reader was taken out is read again (never a
// 304) and lets them in again.
export async function exits(sql: Query, memberId: string): Promise<string> {
  const [row] = await sql<{ n: string }[]>`select n::text as n from live_out where member_id = ${memberId}`;
  return row?.n ?? "0";
}

export async function stamp(sql: Query, today: string, at = new Date()): Promise<string> {
  return `${await changeStamp(sql as Parameters<typeof changeStamp>[0])}.${today}.${Math.floor(at.getTime() / 900_000)}`;
}
