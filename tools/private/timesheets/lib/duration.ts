// Safe in the browser: no SDK here.
// Durations as people type them in a timesheet, and as the tool writes
// them. Whole minutes throughout.
//
// Understood (spaces and case aside):
//   "1:30"  "0:45"  ":45"            hours:minutes
//   "1.5"  "1,5"  "2"  ".25"         hours, with a dot or a comma
//   "90m"  "90 min"  "45mn"          minutes
//   "1h30"  "1h 30m"  "1 h 30 min"   hours and minutes
//   "1.5h"  "2 hrs"  "3 heures"      hours with a unit
// A plain number is hours (as in Harvest and Clockify): "8" is 8 hours.
// Empty is zero. Anything else, or more than a day, is null.
export const maxMinutes = 24 * 60;

const hourUnit = "(?:h|hr|hrs|hour|hours|heure|heures)";
const minuteUnit = "(?:m|mn|min|mins|minute|minutes)";
const number = "(\\d+(?:[.,]\\d*)?|[.,]\\d+)";

const patterns: { re: RegExp; read: (m: RegExpMatchArray) => number | null }[] = [
  // 1:30, :45, 12:05
  { re: /^(\d{0,2}):([0-5]?\d)$/u, read: m => Number(m[1] || 0) * 60 + Number(m[2]) },
  // 1.5, 1,5, 2, .25 (hours)
  { re: new RegExp(`^${number}$`, "u"), read: m => decimal(m[1]!) * 60 },
  // 1.5h, 2 hrs
  { re: new RegExp(`^${number}${hourUnit}$`, "u"), read: m => decimal(m[1]!) * 60 },
  // 90m, 90 min
  { re: new RegExp(`^${number}${minuteUnit}$`, "u"), read: m => decimal(m[1]!) },
  // 1h30, 1h30m, 1h 30 min
  { re: new RegExp(`^(\\d+)${hourUnit}(\\d{1,2})(?:${minuteUnit})?$`, "u"), read: m => (Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null) },
];

function decimal(text: string): number {
  return Number(text.replace(",", "."));
}

// parseDuration reads what someone typed as minutes: 0 for nothing, null
// when it cannot be read or is more than a day.
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/gu, "");
  if (text === "") return 0;
  if (text.length > 20) return null;
  for (const { re, read } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const value = read(m);
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    const minutes = Math.round(value);
    return minutes <= maxMinutes ? minutes : null;
  }
  return null;
}

// formatDuration writes minutes as hours:minutes, "1:30"; zero is "0:00".
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(Math.round(minutes));
  return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

// A running timer's clock: "1:02:05".
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Hours as a decimal number, for exports and amounts: 90 → 1.5.
export function hours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
