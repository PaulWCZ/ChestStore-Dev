import { timeZone } from "@argentic/chest-sdk/schedules";

// The Chest's time zone (CHEST_TIMEZONE, Europe/Paris by default): every
// office of this Chest lives in it. A day, "the morning", 9:00 in the rooms'
// grid are read in it; the database stores instants (timestamptz).
export function zone(): string {
  return timeZone();
}
