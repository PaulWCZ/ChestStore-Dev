// Safe in the browser: no SDK here.
// Times of day in a time zone (the Chest's): an interview at "14:30" on
// "2026-10-12" in Europe/Paris is one instant, whatever the server's zone
// and whatever daylight saving does that day. The zone's readings (offset,
// dayOf, timeOf) are ./format.ts's, with kept Intl objects.
import { dayOf, offset, timeOf } from "./format.ts";

export { dayOf, offset, timeOf };

// instantOf: the instant a day and a time of day are in a zone. A time
// that does not exist (the hour skipped in spring) lands an hour later; a
// time that exists twice (autumn) is the first.
export function instantOf(day: string, time: string, zone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, min);
  let at = guess - offset(guess, zone);
  const again = guess - offset(at, zone);
  if (again !== at) at = Math.min(at, again);
  return new Date(at);
}

// The times an interview may start: every quarter of an hour, 07:00–20:45
// (a select in 24-hour steps: native time fields follow the browser's
// locale, AM/PM on many computers).
export const startTimes: string[] = Array.from({ length: 14 * 4 }, (_, i) => `${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
export const durations = [15, 30, 45, 60, 90, 120, 180] as const;
export const isTime = (value: unknown): value is string => typeof value === "string" && startTimes.includes(value);

// addDays: a day plus n days.
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
