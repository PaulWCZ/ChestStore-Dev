// Safe in the browser: no SDK here.
// The day a new rate starts, checked before anything is saved: it must be
// given, and after the locked period. A date typed inside the locked period
// is refused with a sentence — never quietly replaced by today (the
// critique's N1: "Saved." while a rate had been set from today).
export type RateLock = { until: string; text: string } | null;

export function rateDayProblem(from: string | null, lock: RateLock, words: { missing: string }): string | null {
  if (from === null) return words.missing;
  if (lock && from <= lock.until) return lock.text;
  return null;
}
