import * as chest from "@argentic/chest-sdk/chest";

// The Chest's time zone (IANA): the clock people read days and times on.
// Proposal (studio): the Chest gives it (CHEST_TIMEZONE); Europe/Paris when
// it says none, or names a zone this server does not know.
export function chestZone(): string {
  return chest.timeZone();
}

// Today on the Chest's clock, "YYYY-MM-DD".
export function chestToday(now = new Date()): string {
  return chest.today(now, chestZone());
}
