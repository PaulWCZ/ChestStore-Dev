import * as chest from "@argentic/chest-sdk/chest";
import { mondayOf } from "./model.ts";
import { instantOf } from "./zone.ts";

// The Chest's calendar (Proposal (studio): the chest module): its time zone
// makes "today" and "this week" — never the server's, never a zone written
// in the tool.
export function zone(): string {
  return chest.timeZone();
}

export function today(now: Date = new Date()): string {
  return chest.today(now, zone());
}

// The first instant of this week (Monday 00:00 in the Chest's zone): a
// key result checked in since then is done for the week.
export function weekStart(now: Date = new Date()): Date {
  const z = zone();
  return instantOf(mondayOf(chest.today(now, z)), 0, z);
}
