// Working hours: when the team answers. "Waiting 3 h" and the "waiting too
// long" highlight count only these hours, so a Friday-evening email is not
// red on Monday at 9:05. Pure (tested alone, used in the browser too); the
// time zone is the Chest's.

// Each day of the week, Monday first: the hours the team works, in minutes
// from midnight (start < end), or null for a day off. `on` false: every
// hour of the clock counts (nights and weekends too). Holidays: days off
// (YYYY-MM-DD), whatever their weekday.
export type Day = { start: number; end: number } | null;
export type Hours = { on: boolean; days: Day[]; holidays: string[] };

export const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const defaultHours: Hours = { on: true, days: [...Array(5).fill({ start: 9 * 60, end: 18 * 60 }), null, null], holidays: [] };
export const maxHolidays = 60;
// The times a day may start or end: every half hour.
export const halfHours = Array.from({ length: 49 }, (_, i) => i * 30);
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
export const isDate = (value: unknown): value is string => typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().startsWith(value);

// parseHours checks what was sent or stored: seven days, each off or a
// start before its end on the half hour, 60 holidays at most. Null when
// anything is not right; readHours then gives the default — a wrong value
// never breaks the inbox.
export function parseHours(value: unknown): Hours | null {
  const v = value as Partial<Hours> | null;
  if (!v || typeof v !== "object" || !Array.isArray(v.days) || v.days.length !== 7) return null;
  const days: Day[] = [];
  for (const d of v.days) {
    if (d === null) {
      days.push(null);
      continue;
    }
    const { start, end } = (d ?? {}) as { start?: unknown; end?: unknown };
    if (typeof start !== "number" || typeof end !== "number" || !halfHours.includes(start) || !halfHours.includes(end) || start >= end) return null;
    days.push({ start, end });
  }
  const given = v.holidays ?? [];
  if (!Array.isArray(given) || given.length > maxHolidays || !given.every(isDate)) return null;
  return { on: v.on !== false, days, holidays: [...new Set(given)].sort() };
}
export const readHours = (value: unknown): Hours => parseHours(value) ?? defaultHours;

// ---- Time zones, with Intl only --------------------------------------------

const formats = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, timeZone: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { y: Number(p["year"]), m: Number(p["month"]), d: Number(p["day"]), h: Number(p["hour"]) % 24, min: Number(p["minute"]), s: Number(p["second"]) };
}
// How far the zone's clock is ahead of UTC at that moment, in ms.
function offset(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}
// The moment a wall clock of the zone shows that day at those minutes.
export function zoned(day: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offset(new Date(guess), timeZone);
  const second = guess - offset(new Date(first), timeZone);
  return new Date(second);
}
// The zone's day of a moment (YYYY-MM-DD).
export function localDay(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
const nextDay = (day: string) => new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
// Monday 0 … Sunday 6.
export const weekday = (day: string) => (new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7;

// workMinutes counts the minutes between two moments that fall in the
// working hours (all of them when hours are off). A wait longer than a year
// counts its first year only: it is late anyway.
export function workMinutes(from: Date | string, to: Date | string, hours: Hours, timeZone: string): number {
  const a = new Date(from), b = new Date(to);
  if (!(b > a)) return 0;
  if (!hours.on) return Math.floor((b.getTime() - a.getTime()) / 60000);
  const off = new Set(hours.holidays);
  let total = 0;
  let day = localDay(a, timeZone);
  const last = localDay(b, timeZone);
  for (let i = 0; i < 400; i++) {
    const open = hours.days[weekday(day)];
    if (open && !off.has(day)) {
      const start = Math.max(zoned(day, open.start, timeZone).getTime(), a.getTime());
      const end = Math.min(zoned(day, open.end, timeZone).getTime(), b.getTime());
      if (end > start) total += end - start;
    }
    if (day >= last) break;
    day = nextDay(day);
  }
  return Math.floor(total / 60000);
}

// France's public holidays of a year (Code du travail L3133-1): the fixed
// ones and those that follow Easter (Monday, Ascension, Whit Monday).
// Easter: the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function frenchHolidays(year: number): string[] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = Date.UTC(year, month - 1, day);
  const after = (days: number) => new Date(easter + days * 86400000).toISOString().slice(0, 10);
  const fixed = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].map(md => `${year}-${md}`);
  return [...fixed, after(1), after(39), after(50)].sort();
}

// A moment as a spreadsheet reads it, on the zone's clock: "2026-09-28 22:45".
export function stamp(date: Date | string, timeZone: string): string {
  const p = parts(new Date(date), timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}
