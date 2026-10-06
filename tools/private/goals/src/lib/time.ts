import { chest } from "@argentic/chest-sdk/chest";
import { mondayOf } from "./model.ts";
import { instantOf } from "./zone.ts";

// The Chest's calendar (SDK 0.3.0: chest.timeZone, chest.today): its time
// zone makes "today" and "this week" — never the server's, never a zone
// written in the tool. The database's current_date is the same day: the
// Chest puts the tool's sessions in its zone.
export function zone(): string {
  return chest.timeZone;
}

export function today(now: Date = new Date()): string {
  return chest.today(now);
}

// The first instant of this week (Monday 00:00 in the Chest's zone): a
// key result checked in since then is done for the week.
export function weekStart(now: Date = new Date()): Date {
  const z = zone();
  return instantOf(mondayOf(chest.today(now)), 0, z);
}
