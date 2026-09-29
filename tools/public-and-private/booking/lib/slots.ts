import { addDays, instantOf, wall, weekdayOf } from "./zone.ts";

// The free times of a booking type: the host's weekly hours (and the days
// they changed), minus what is booked (with buffers), from the minimum
// notice to the end of the booking window, on days the type's daily limit
// is not reached yet. Pure: given the same inputs, the same slots — the
// page shows them, the booking re-checks them (in a transaction).

// Ranges of minutes in a day, [start, end).
export type Ranges = [number, number][];
// weekly[0] is Sunday … weekly[6] Saturday; overrides: a date's own ranges
// ([] = a day off).
export type Availability = { weekly: Ranges[]; overrides: Record<string, Ranges>; zone: string };
// dailyLimit: at most this many bookings of the type on a day of the
// host's calendar (0: no limit).
// hostDailyMax: at most this many meetings a day for the host, all types
// together (0 or absent: no limit).
export type Rules = { duration: number; interval: number; bufferBefore: number; bufferAfter: number; noticeMinutes: number; windowDays: number; dailyLimit: number; hostDailyMax?: number };
// A time the host is not free: a confirmed booking (buffers included), a
// time they blocked, a meeting of their own calendar. sameType: the start
// of a booking of this very type, which counts for the daily limit; own:
// the start of any booking of the host, for the host's daily maximum.
export type Busy = { start: number; end: number; sameType?: number; own?: number };
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
  // The type's bookings per day of the host's calendar.
  const perDay = new Map<string, number>();
  const allTypes = new Map<string, number>();
  for (const b of busy) {
    if (b.own !== undefined) {
      const day = wall(b.own, availability.zone).date;
      allTypes.set(day, (allTypes.get(day) ?? 0) + 1);
    }
    if (b.sameType === undefined) continue;
    const day = wall(b.sameType, availability.zone).date;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const hostMax = rules.hostDailyMax ?? 0;
  const found: Slot[] = [];
  for (let date = from; date <= to && found.length < 3000; date = addDays(date, 1)) {
    if (rules.dailyLimit > 0 && (perDay.get(date) ?? 0) >= rules.dailyLimit) continue;
    if (hostMax > 0 && (allTypes.get(date) ?? 0) >= hostMax) continue;
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

// A free stretch of one day of the host's calendar: minutes of their clock
// (end up to 1440), for the agenda ("Free 14:00–17:30": tap it to block it).
export type Window = { start: number; end: number };

// freeWindows: the host's open hours of one date, minus what keeps them
// busy (bookings with their buffers, times blocked, other calendars), from
// now on, on the quarter hour (blocks are made on it), at least `least`
// minutes long.
export function freeWindows(availability: Availability, busy: Pick<Busy, "start" | "end">[], date: string, now = Date.now(), least = 15): Window[] {
  const ranges = availability.overrides[date] ?? availability.weekly[weekdayOf(date)] ?? [];
  const minuteOf = (t: number) => {
    const w = wall(t, availability.zone);
    return w.date === date ? w.minutes : w.date < date ? 0 : 1440;
  };
  const out: Window[] = [];
  for (const [open, close] of ranges) {
    const from = instantOf(date, open, availability.zone).getTime();
    const to = close === 1440 ? instantOf(addDays(date, 1), 0, availability.zone).getTime() : instantOf(date, close, availability.zone).getTime();
    let pieces = [{ start: Math.max(from, now), end: to }];
    for (const b of busy) {
      pieces = pieces.flatMap(p => (b.end <= p.start || b.start >= p.end ? [p] : [{ start: p.start, end: b.start }, { start: b.end, end: p.end }].filter(x => x.end > x.start)));
    }
    for (const p of pieces) {
      const start = Math.ceil(minuteOf(p.start) / 15) * 15;
      const end = Math.floor(minuteOf(p.end) / 15) * 15;
      if (end - start >= least) out.push({ start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
