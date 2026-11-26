// Safe in the browser: no SDK here.
// Calendar days ("YYYY-MM-DD") and wall-clock times in the Chest's time
// zone, with nothing but Intl: a timer started at 23:50 in Paris belongs to
// that Paris day, whatever the server's clock says. Weeks start on Monday.
// Pure and tested (daylight-saving changes included).

export const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !dayPattern.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 0 Sunday … 6 Saturday.
export function weekdayOf(day: string): number {
  return new Date(day + "T00:00:00Z").getUTCDay();
}

// mondayOf is the Monday of that day's week.
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

export function monthStart(day: string): string {
  return day.slice(0, 8) + "01";
}

export function monthEnd(day: string): string {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// A clock in a zone.
export type Wall = { day: string; minutes: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(zone, f);
  }
  return f;
}

// wall is what a clock shows in that zone at that instant.
export function wall(instant: Date | number, zone: string): Wall {
  const parts = Object.fromEntries(formatter(zone).formatToParts(typeof instant === "number" ? new Date(instant) : instant).map(p => [p.type, p.value]));
  return { day: `${parts["year"]}-${parts["month"]}-${parts["day"]}`, minutes: (Number(parts["hour"]) % 24) * 60 + Number(parts["minute"]) };
}

export function todayIn(zone: string, now: Date | number = Date.now()): string {
  return wall(now, zone).day;
}

function offset(instant: number, zone: string): number {
  const w = wall(instant, zone);
  const [y, m, d] = w.day.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(w.minutes / 60), w.minutes % 60);
  return Math.round((asUtc - Math.floor(instant / 60000) * 60000) / 60000);
}

// instantOf is the moment a clock in that zone shows that day and minutes.
// A time the clock skips (the spring change) is read after the change; one
// it shows twice (the autumn change) is the first.
export function instantOf(day: string, minutes: number, zone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60000;
  const offsets = new Set([offset(guess - 43200000, zone), offset(guess, zone), offset(guess + 43200000, zone)]);
  const tries = [...offsets].map(o => guess - o * 60000);
  const found = tries.filter(t => {
    const w = wall(t, zone);
    return w.day === day && w.minutes === minutes;
  });
  if (found.length > 0) return new Date(Math.min(...found));
  return new Date(Math.max(...tries));
}

// Minutes after midnight as "HH:MM".
export const toTime = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
