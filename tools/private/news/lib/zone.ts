import { chest } from "@argentic/chest-sdk/chest";

// The Chest's time zone (IANA): the clock the company's days and times are
// read on (SDK 0.3.0: CHEST_TIME_ZONE, "UTC" until the owner sets one; it
// throws outside a Chest rather than guess).
export function chestZone(): string {
  return chest.timeZone;
}
