import { addDays, instantOf, wall, weekdayOf } from "./zone.ts";

// The free times of a booking type: the host's weekly hours (and the days
// they changed), minus what is booked (with buffers), from the minimum
// notice to the end of the booking window. Pure: given the same inputs,
// the same slots — the page shows them, the booking re-checks them.

// Ranges of minutes in a day, [start, end).
export type Ranges = [number, number][];
// weekly[0] is Sunday … weekly[6] Saturday; overrides: a date's own ranges
// ([] = a day off).
export type Availability = { weekly: Ranges[]; overrides: Record<string, Ranges>; zone: string };
export type Rules = { duration: number; interval: number; bufferBefore: number; bufferAfter: number; noticeMinutes: number; windowDays: number };
export type Busy = { start: number; end: number };
export type Slot = { start: string; end: string };

export function validRanges(value: unknown): value is Ranges {
  if (!Array.isArray(value) || value.length > 8) return false;
  const ranges = value as unknown[];
  if (!ranges.every(r => Array.isArray(r) && r.length === 2 && r.every(x => Number.isInteger(x)) && (r[0] as number) >= 0 && (r[1] as number) <= 1440 && (r[0] as number) < (r[1] as number))) return false;
  const sorted = [...(ranges as Ranges)].sort((a, b) => a[0] - b[0]);
  return sorted.every((r, i) => i === 0 || r[0] >= sorted[i - 1]![1]);
}

// slots lists the free starts between two dates of the host's calendar
// (both included), never before now + notice nor after the window.
export function slots(availability: Availability, rules: Rules, busy: Busy[], range: { from: string; to: string }, now = Date.now()): Slot[] {
  const earliest = now + rules.noticeMinutes * 60000;
  const today = wall(now, availability.zone).date;
  const lastDay = addDays(today, rules.windowDays);
  const from = range.from < today ? today : range.from;
  const to = range.to > lastDay ? lastDay : range.to;
  const blocked = busy.map(b => ({ start: b.start - rules.bufferAfter * 60000, end: b.end + rules.bufferBefore * 60000 })).sort((a, b) => a.start - b.start);
  const found: Slot[] = [];
  for (let date = from; date <= to && found.length < 3000; date = addDays(date, 1)) {
    const ranges = availability.overrides[date] ?? availability.weekly[weekdayOf(date)] ?? [];
    for (const [open, close] of ranges) {
      for (let minute = open; minute + rules.duration <= close; minute += rules.interval) {
        const start = instantOf(date, minute, availability.zone).getTime();
        const end = start + rules.duration * 60000;
        if (start < earliest) continue;
        // A skipped hour (spring change) is not offered twice.
        if (wall(start, availability.zone).minutes !== minute) continue;
        if (blocked.some(b => b.start < end && start < b.end)) continue;
        found.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
  }
  return found;
}

// defaultWeek: Monday to Friday, 9:00–12:30 and 14:00–17:30.
export const defaultWeek: Ranges[] = [[], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], [[540, 750], [840, 1050]], []];
