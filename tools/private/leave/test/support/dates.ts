import { addDays, holidaysBetween, weekday } from "../../lib/calendar.ts";
import { today } from "../../lib/today.ts";

// A Monday at least `after` days ahead whose week (Monday to Saturday, and
// the next Monday) has no public holiday, even in Alsace-Moselle: tests
// that count days do not depend on the day they run.
export function quietMonday(after = 14): string {
  let d = addDays(today(), after);
  while (weekday(d) !== 1) d = addDays(d, 1);
  while (holidaysBetween(d, addDays(d, 7), { alsace: true }).size > 0) d = addDays(d, 7);
  return d;
}

export const week = (monday: string) => ({ start: monday, startHalf: "am", end: addDays(monday, 4), endHalf: "pm" });
