import { addDays, type Day, type Span } from "./calendar.ts";

// zoned: a day and a time of day in a time zone, as an instant
// ("2026-03-02", 12 in Paris → 11:00 UTC). Across a change of the clocks,
// a time that does not exist moves on, one that exists twice is the first.
export function zoned(day: Day, hour: number, timeZone: string): Date {
  const guess = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  const offset = (at: number) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
    return Date.UTC(Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"]), Number(parts["hour"]), Number(parts["minute"]), Number(parts["second"])) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

// An approved leave as instants, in a time zone: from the start of its
// first day (noon when it starts in the afternoon) to the end of its last
// day (noon when it ends in the morning) — what leave.approved already
// says with fromHalf and toHalf. Whole days, never working hours: Leave
// does not know them, and someone off is off the whole day.
export function instants(r: Span, timeZone: string): { start: Date; end: Date } {
  return {
    start: zoned(r.start, r.startHalf === "pm" ? 12 : 0, timeZone),
    end: r.endHalf === "am" ? zoned(r.end, 12, timeZone) : zoned(addDays(r.end, 1), 0, timeZone),
  };
}

// wholeDays: a leave that starts in the morning and ends in the evening
// (a calendar shows it as whole days, not hours).
export const wholeDays = (r: Span) => r.startHalf === "am" && r.endHalf === "pm";
