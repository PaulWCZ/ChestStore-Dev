import { dateFormat } from "./format.ts";

// Safe in the browser: dates and hours on a time zone's clock, with Intl
// only (its formats made once: ./format.ts). The closing date of a form is typed as a day and an hour on the
// Chest's clock (chest.timeZone, read on the server and passed down).

// The offset of a zone at an instant, in minutes (Paris in summer: 120).
function offset(zone: string, at: Date): number {
  const parts = Object.fromEntries(dateFormat("en-US", zone, { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map(p => [p.type, p.value]));
  const local = Date.UTC(Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"]), Number(parts["hour"]), Number(parts["minute"]), Number(parts["second"]));
  return Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

// zonedInstant: the instant a day ("YYYY-MM-DD") and hour (0–23) read on
// that zone's clock. A time skipped by a change of clock moves forward.
export function zonedInstant(day: string, hour: number, zone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (!m || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("invalid day or hour");
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour);
  if (new Date(guess).toISOString().slice(0, 10) !== day) throw new RangeError("invalid day");
  let at = new Date(guess - offset(zone, new Date(guess)) * 60000);
  at = new Date(guess - offset(zone, at) * 60000);
  return at;
}

// zonedParts: the day and hour of an instant on a zone's clock.
export function zonedParts(at: Date, zone: string): { day: string; hour: number } {
  const parts = Object.fromEntries(dateFormat("en-US", zone, { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(at).map(p => [p.type, p.value]));
  return { day: `${parts["year"]}-${parts["month"]}-${parts["day"]}`, hour: Number(parts["hour"]) % 24 };
}
