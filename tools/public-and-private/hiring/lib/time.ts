// Safe in the browser: no SDK here.
// Times of day in a time zone (the Chest's): an interview at "14:30" on
// "2026-10-12" in Europe/Paris is one instant, whatever the server's zone
// and whatever daylight saving does that day.

// offset: how far a zone is ahead of UTC at an instant, in milliseconds.
export function offset(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

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

// dayOf: the day ("YYYY-MM-DD") an instant falls on in a zone.
export function dayOf(instant: Date | string, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// timeOf: the time of day ("09:30") an instant is in a zone.
export function timeOf(instant: Date | string, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
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
