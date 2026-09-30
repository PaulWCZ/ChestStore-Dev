// Safe in the browser: no SDK here.
// Days and times on the Chest's clock. People type a day and a time as they
// read them on the office wall (the Chest's time zone, chest.timeZone —
// the database session's too); the database keeps instants (UTC). Pure, tested
// across daylight-saving changes.
import { AppError } from "./app-error.ts";

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/u;

// day reads "YYYY-MM-DD", a real date between 2000 and 2100.
export function day(value: unknown): string {
  if (typeof value !== "string") throw new AppError("bad_date");
  const m = dayPattern.exec(value);
  if (!m) throw new AppError("bad_date");
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) throw new AppError("bad_date");
  return value;
}

// time reads "HH:MM" (24 hours).
export function time(value: unknown): string {
  if (typeof value !== "string" || !timePattern.test(value)) throw new AppError("bad_date");
  return value;
}

// The wall-clock parts of an instant in a time zone.
function parts(instant: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const found: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant)) {
    if (p.type !== "literal") found[p.type] = Number(p.value);
  }
  return { year: found["year"]!, month: found["month"]!, day: found["day"]!, hour: found["hour"]! % 24, minute: found["minute"]! };
}

// offset is how far the zone's clock is ahead of UTC at that instant, in ms.
function offset(instant: Date, zone: string): number {
  const p = parts(instant, zone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(instant.getTime() / 60000) * 60000;
}

// zoned is the instant a wall clock of the zone shows that day and time. A
// time skipped by a daylight-saving change (02:30 on the last Sunday of
// March in Paris) is read one hour later, as clocks do; a time shown twice
// is its first occurrence.
export function zoned(dayText: string, timeText: string, zone: string): Date {
  const [y, mo, d] = day(dayText).split("-").map(Number) as [number, number, number];
  const [h, mi] = time(timeText).split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offsets a day before and a day after: a change of offset
  // (never two within two days) lies between them.
  const before = wall - offset(new Date(wall - 864e5), zone);
  const after = wall - offset(new Date(wall + 864e5), zone);
  const shows = (instant: number) => {
    const l = local(new Date(instant), zone);
    return l.day === dayText && l.time === timeText;
  };
  const real = [before, after].filter(shows);
  return new Date(real.length > 0 ? Math.min(...real) : before);
}

// local gives the day and time an instant shows on the zone's clock.
export function local(instant: Date | string, zone: string): { day: string; time: string } {
  const p = parts(typeof instant === "string" ? new Date(instant) : instant, zone);
  const two = (n: number) => String(n).padStart(2, "0");
  return { day: `${p.year}-${two(p.month)}-${two(p.day)}`, time: `${two(p.hour)}:${two(p.minute)}` };
}

// today on the zone's clock.
export function today(zone: string, now = new Date()): string {
  return local(now, zone).day;
}

// The day after, for all-day events (their end is the next day, exclusive).
export function nextDay(dayText: string): string {
  const date = new Date(day(dayText) + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
