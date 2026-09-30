import { chest } from "@argentic/chest-sdk/chest";
import { dayIn, zonedIn } from "./model.ts";

// The Chest's time zone (chest.timeZone, given by the Chest; its owner sets
// it in Settings → General). "Today", a next step's day, "won this month"
// and the week of the team report are the company's, in this zone; the
// database's sessions are in it too (current_date). Server only: client
// components receive the day as a prop.
export function chestZone(): string {
  return chest.timeZone;
}

// Today in the Chest's zone, as a day (YYYY-MM-DD).
export function today(now = new Date()): string {
  return dayIn(chest.timeZone, now);
}

// A day and a time of day in the Chest's zone, as an instant.
export function zoned(day: string, clock: string): Date {
  return zonedIn(day, clock, chest.timeZone);
}
