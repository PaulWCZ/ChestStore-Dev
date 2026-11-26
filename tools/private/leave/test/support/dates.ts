import { addDays, holidaysBetween, weekday } from "../../src/shared/calendar.ts";
import { today } from "../../src/lib/today.ts";

// A Monday at least `after` days ahead whose week (Monday to Saturday, and
// the next Monday) has no public holiday, even in Alsace-Moselle: tests
// that count days do not depend on the day they run. Two different
// `after` never give the same week (around Christmas, skipping the weeks
// with a holiday would bring two of them to one week: a test file's
// requests would overlap on some days of the year only); the same `after`
// gives the same week.
const given = new Map<number, string>();
export function quietMonday(after = 14): string {
  const known = given.get(after);
  if (known) return known;
  const taken = new Set([...given.values()].flatMap(m => [addDays(m, -7), m, addDays(m, 7)]));
  let d = addDays(today(), after);
  while (weekday(d) !== 1) d = addDays(d, 1);
  while (holidaysBetween(d, addDays(d, 7), { alsace: true }).size > 0 || taken.has(d)) d = addDays(d, 7);
  given.set(after, d);
  return d;
}

export const week = (monday: string) => ({ start: monday, startHalf: "am", end: addDays(monday, 4), endHalf: "pm" });
