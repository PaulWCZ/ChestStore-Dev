import { chest } from "@argentic/chest-sdk/chest";
import { todayIn } from "./days.ts";

// The time and money of the tool, as the Chest gives them
// (@argentic/chest-sdk/chest): its time zone (chest.timeZone: the day an
// entry belongs to, "this week", Friday's reminder — the database's
// current_date is that day too, the Chest's zone being its sessions') and
// its currency (chest.currency, a studio proposal: rates and amounts). Tests move `clock.now` to play a forgotten timer.
export const clock = { now: (): Date => new Date() };

export function zone(): string {
  return chest.timeZone;
}

export function today(): string {
  return todayIn(zone(), clock.now());
}

export function currency(): string {
  return chest.currency;
}
