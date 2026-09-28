// Safe in the browser: no SDK here — but call it on the server: Node's and
// a browser's Intl may write the same date differently (hydration).
// How pages and bell items write days and times: in the reader's language,
// on the Chest's clock.
import { format, intl, relative } from "./i18n/format.ts";

export type When = { day: string; start: string | null; end: string | null };

const sameYear = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4);

export function dates(locale: string, zone: string, now = new Date()) {
  const fmt = (options: Intl.DateTimeFormatOptions, z = zone) => new Intl.DateTimeFormat(intl(locale), { ...options, timeZone: z });
  const thisYear = fmt({ year: "numeric" }).format(now);
  // A day of the calendar ("YYYY-MM-DD") is the same everywhere: read at noon UTC.
  const calendarDay = (day: string, options: Intl.DateTimeFormatOptions) => fmt(options, "UTC").format(new Date(day + "T12:00:00Z"));
  const withYear = (day: string): Intl.DateTimeFormatOptions => (sameYear(day, thisYear) ? {} : { year: "numeric" });
  return {
    // "Friday 18 December" (with the year when not this year's).
    dayLong: (day: string) => calendarDay(day, { weekday: "long", day: "numeric", month: "long", ...withYear(day) }),
    // "Fri 18 Dec".
    dayShort: (day: string) => calendarDay(day, { weekday: "short", day: "numeric", month: "short", ...withYear(day) }),
    weekday: (day: string) => calendarDay(day, { weekday: "short" }),
    dayNumber: (day: string) => calendarDay(day, { day: "numeric" }),
    month: (day: string) => calendarDay(day, { month: "short" }),
    // "19:00 – 23:00", "19:00", or "" for a whole day.
    hours: (o: When, range: string) => (o.start ? (o.end ? format(range, { start: o.start, end: o.end }) : o.start) : ""),
    // An instant: "Fri 12 Dec, 18:00".
    at: (iso: string) => {
      const d = new Date(iso);
      const y = fmt({ year: "numeric" }).format(d);
      return fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(y === thisYear ? {} : { year: "numeric" }) }).format(d);
    },
    ago: (iso: string) => relative(iso, locale, now),
    // The names a date picker shows (the composer's calendar is drawn in the
    // browser: the words come from here, the same on both sides).
    monthNames: () => Array.from({ length: 12 }, (_, m) => fmt({ month: "long" }, "UTC").format(new Date(Date.UTC(2026, m, 15, 12)))),
    // Monday first.
    weekdayNames: () => Array.from({ length: 7 }, (_, d) => fmt({ weekday: "short" }, "UTC").format(new Date(Date.UTC(2026, 0, 5 + d, 12)))),
  };
}

// An option of a date poll in words: "Friday 18 December · 19:00 – 23:00".
export function optionText(o: When, locale: string, zone: string, words: { range: string; dayAndTime: string }, now = new Date()): string {
  const d = dates(locale, zone, now);
  const hours = d.hours(o, words.range);
  return hours ? format(words.dayAndTime, { day: d.dayLong(o.day), time: hours }) : d.dayLong(o.day);
}
