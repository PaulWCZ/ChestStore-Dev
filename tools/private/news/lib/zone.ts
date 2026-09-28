import { timeZone } from "@argentic/chest-sdk/schedules";

// The Chest's time zone (IANA): the clock people read days and times on.
// Proposal (studio): the Chest gives it (CHEST_TIMEZONE); Europe/Paris when
// it says none, or names a zone this server does not know.
export function chestZone(): string {
  const zone = timeZone();
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "Europe/Paris";
  }
}
