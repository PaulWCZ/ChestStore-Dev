import { changeStamp } from "@argentic/chest-app/db";
import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import type { Query } from "./db.ts";
import { minutesNow, today } from "../shared/model.ts";

// A page's version (page(render, { version })): the package's change stamp
// of the tables the pages read (migrations/0011: right under concurrent
// writes, unmoved by a statement that changes nothing), the day and the quarter hour in the office's zone (the
// line of now, the check-in windows, what is past) — a few characters. The
// package keys it by reader, language and address; the names of people
// come from the Chest and follow at the next quarter hour at the latest.
// A member whose role gives nothing has no version (the layout says why).
export async function stamp(sql: Query, member: Member, zone: string, at = new Date()): Promise<string | null> {
  if (roleOf(member) === null) return null;
  return `${await changeStamp(sql as Parameters<typeof changeStamp>[0])}.${today(zone, at)}.${Math.floor(minutesNow(zone, at) / 15)}`;
}
