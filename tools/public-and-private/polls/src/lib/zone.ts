import { chest } from "@argentic/chest-sdk/chest";

// The Chest's time zone (IANA): the clock people read days and times on.
// SDK 0.3.0: the Chest gives it (CHEST_TIME_ZONE); reading it outside a
// Chest throws.
export function chestZone(): string {
  return chest.timeZone;
}

// Today on the Chest's clock, "YYYY-MM-DD".
export function chestToday(now = new Date()): string {
  return chest.today(now);
}
