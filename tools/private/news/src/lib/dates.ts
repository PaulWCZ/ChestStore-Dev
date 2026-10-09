// Safe in the browser: no SDK here.
// How a page writes days and times: in the reader's language, on the
// Chest's clock (its time zone).
import { format, formatDate, relative } from "../i18n/index.ts";
import type { EventInfo } from "./posts.ts";

export type Dates = ReturnType<typeof dates>;

export function dates(locale: string, zone: string, now = new Date()) {
  const at = (value: string, options: Intl.DateTimeFormatOptions) => formatDate(value, locale, { ...options, timeZone: zone });
  // A day of the calendar ("YYYY-MM-DD") is the same everywhere: read at noon UTC.
  const day = (value: string, options: Intl.DateTimeFormatOptions) => formatDate(value + "T12:00:00Z", locale, { ...options, timeZone: "UTC" });
  return {
    ago: (value: string) => relative(value, locale, now),
    full: (value: string) => at(value, { dateStyle: "long", timeStyle: "short" }),
    date: (value: string) => at(value, { day: "numeric", month: "long", year: "numeric" }),
    short: (value: string) => at(value, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    today: () => at(now.toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: (value: string) => at(value, { hour: "numeric", minute: "2-digit" }),
    dayLong: (value: string) => day(value, { weekday: "long", day: "numeric", month: "long" }),
    dayNumber: (value: string) => day(value, { day: "numeric" }),
    month: (value: string) => day(value, { month: "short" }),
    weekday: (value: string) => day(value, { weekday: "short" }),
    // "Monday 3 November", or "Monday 3 – Wednesday 5 November" over several days.
    days(event: EventInfo, words: { dayRange: string }): string {
      if (!event.lastDay) return day(event.day, { weekday: "long", day: "numeric", month: "long" });
      return format(words.dayRange, { first: day(event.day, { weekday: "short", day: "numeric", month: "short" }), last: day(event.lastDay, { weekday: "short", day: "numeric", month: "short" }) });
    },
    // "19:30 – 23:00", "19:30", or the words for all day.
    hours(event: EventInfo, words: { allDay: string; timeRange: string }): string {
      if (!event.start) return words.allDay;
      const start = at(event.start, { hour: "numeric", minute: "2-digit" });
      return event.end ? format(words.timeRange, { start, end: at(event.end, { hour: "numeric", minute: "2-digit" }) }) : start;
    },
  };
}
