// Days ("YYYY-MM-DD") and times of day on a wall clock, as plain
// arithmetic: no zone, no Intl. Shared by the server (src/lib/zone.ts) and
// the browser's forms (the maintenance window, an incident of the past).

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

// A day and a time of day on the wall clock ("2026-10-01", 1320 for 22:00).
export type WallTime = { day: string; minutes: number };

const minutesOf = (w: WallTime) => {
  const [y, m, d] = w.day.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 60000 + w.minutes;
};

// moveWindow: the start of a window moved (its day or its time); the end
// moves with it, so the length stays — a maintenance planned for an hour
// is still an hour (the Rooms bug the UI kit's moveStart fixes for times
// alone, here across days). Wall-clock arithmetic: a time change of the
// zone inside the window is ignored. An end before the start counts as a
// window of no length.
export function moveWindow(start: WallTime, end: WallTime, next: WallTime): { start: WallTime; end: WallTime } {
  if (!isDate(start.day) || !isDate(end.day) || !isDate(next.day)) return { start: next, end };
  const length = Math.max(0, minutesOf(end) - minutesOf(start));
  const at = minutesOf(next) + length;
  const day = new Date(Math.floor(at / 1440) * 86400000).toISOString().slice(0, 10);
  return { start: next, end: { day, minutes: ((at % 1440) + 1440) % 1440 } };
}
