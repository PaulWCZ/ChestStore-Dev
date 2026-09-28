import * as chest from "@argentic/chest-sdk/chest";
import { todayIn } from "./days.ts";

// The time and money of the tool, as the Chest gives them (Proposal
// (studio), @argentic/chest-sdk/chest): its time zone (the day an entry
// belongs to, "this week", Friday's reminder) and its currency (rates and
// amounts). Tests move `clock.now` to play a forgotten timer.
export const clock = { now: (): Date => new Date() };

export function zone(): string {
  return chest.timeZone();
}

export function today(): string {
  return todayIn(zone(), clock.now());
}

export function currency(): string {
  return chest.currency();
}
