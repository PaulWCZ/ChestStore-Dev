// Wall-clock times in a time zone, and back, with nothing but Intl: a
// booking page is written in the host's hours (Europe/Paris) and read in the
// visitor's (America/Montreal). Dates are "YYYY-MM-DD", times minutes after
// midnight. Pure and tested (daylight-saving gaps and overlaps included).

export type Wall = { date: string; minutes: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
    formatters.set(zone, f);
  }
  return f;
}

export function isZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length > 64 || !/^[A-Za-z0-9_+/-]+$/u.test(zone)) return false;
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// wall is what a clock shows in that zone at that instant.
export function wall(instant: Date | number, zone: string): Wall {
  const parts = Object.fromEntries(formatter(zone).formatToParts(typeof instant === "number" ? new Date(instant) : instant).map(p => [p.type, p.value]));
  return { date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`, minutes: Number(parts["hour"]) * 60 + Number(parts["minute"]), weekday: days.indexOf(parts["weekday"] ?? "") };
}

// offset is the zone's distance from UTC at that instant, in minutes
// (Paris in summer: 120).
export function offset(instant: number, zone: string): number {
  const w = wall(instant, zone);
  const [y, m, d] = w.date.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(w.minutes / 60), w.minutes % 60);
  return Math.round((asUtc - Math.floor(instant / 60000) * 60000) / 60000);
}

// instantOf is the moment a clock in that zone shows date and minutes. A
// time the clock skips (the spring change) is read after the change; one it
// shows twice (the autumn change) is the first.
export function instantOf(date: string, minutes: number, zone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60000;
  // The zone's offsets around that day: before and after any change.
  const offsets = new Set([offset(guess - 43200000, zone), offset(guess, zone), offset(guess + 43200000, zone)]);
  const tries = [...offsets].map(o => guess - o * 60000);
  const first = Math.min(...tries), second = Math.max(...tries);
  const candidates = tries.filter(t => {
    const w = wall(t, zone);
    return w.date === date && w.minutes === minutes;
  });
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // In a gap: the same distance after the change.
  return new Date(Math.max(first, second));
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Days and wall times, pure arithmetic shared with the browser's forms
// (src/components/wall-time.ts).
export { addDays, isDate, moveWindow, type WallTime } from "../components/wall-time.ts";
