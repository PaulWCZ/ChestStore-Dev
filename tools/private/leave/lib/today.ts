import { chest } from "@argentic/chest-sdk/chest";
import type { Day } from "./calendar.ts";

// Today, as a day: the Chest's (chest.timeZone), the same for everyone —
// the day of HR's and payroll's work, of "from today", of a last day. It is
// also the database's current_date: the Chest makes its zone the TimeZone
// of the tool's database sessions. Server only (the SDK reads the
// environment); pages in the browser receive it as a prop.
export function today(now: Date | number = Date.now()): Day {
  return chest.today(now);
}
