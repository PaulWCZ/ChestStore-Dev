import { AppError } from "@argentic/chest-app/client";

// When a card repeats: plain rules, and the day the next one is due. Pure
// (no database, no clock): the browser uses the shapes, the server the
// dates. Days are calendar days ("YYYY-MM-DD"), counted in UTC, so a
// summer-time change cannot move them; "today" comes from the Chest's time
// zone (the caller's business).
//
// The model is Asana's: the next card is made when this one is done (not on
// a calendar), so work that was not done does not pile up in copies.

export type Repeat =
  | { every: "day" }
  | { every: "weekday" }
  // days: 0 (Sunday) to 6 (Saturday), at least one.
  | { every: "week"; days: number[] }
  // day: 1 to 31; a month shorter than that uses its last day.
  | { every: "month"; day: number };
export type RepeatKind = Repeat["every"];
export const repeatKinds: readonly RepeatKind[] = ["day", "weekday", "week", "month"];

// parseRepeat reads a rule a page sent: null for "does not repeat";
// anything else malformed is refused.
export function parseRepeat(value: unknown): Repeat | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  const v = value as Record<string, unknown>;
  switch (v["every"]) {
    case "day":
      return { every: "day" };
    case "weekday":
      return { every: "weekday" };
    case "week": {
      const days = v["days"];
      if (!Array.isArray(days) || days.length === 0 || days.length > 7 || !days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) throw new AppError("invalid");
      return { every: "week", days: [...new Set(days as number[])].sort((a, b) => a - b) };
    }
    case "month": {
      const day = v["day"];
      if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31) throw new AppError("invalid");
      return { every: "month", day: day as number };
    }
    default:
      throw new AppError("invalid");
  }
}

const utc = (day: string): Date => new Date(day + "T00:00:00Z");
const iso = (date: Date): string => date.toISOString().slice(0, 10);
export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
// The weekday of a day: 0 (Sunday) to 6.
export const weekday = (day: string): number => utc(day).getUTCDay();
const lastOfMonth = (day: string): number => {
  const d = utc(day);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};

// occurs says whether the rule falls on that day.
export function occurs(rule: Repeat, day: string): boolean {
  switch (rule.every) {
    case "day":
      return true;
    case "weekday":
      return weekday(day) >= 1 && weekday(day) <= 5;
    case "week":
      return rule.days.includes(weekday(day));
    case "month":
      return utc(day).getUTCDate() === Math.min(rule.day, lastOfMonth(day));
  }
}

// nextDue is the first day of the rule after `after`, and not before
// `notBefore` (today): a card done late does not make one already late.
export function nextDue(rule: Repeat, after: string, notBefore: string): string {
  let day = addDays(after, 1);
  if (day < notBefore) day = notBefore;
  // Every rule falls at least once in 31 days; 366 is a safe bound.
  for (let i = 0; i < 366; i++, day = addDays(day, 1)) if (occurs(rule, day)) return day;
  throw new AppError("invalid");
}

// firstDue is the day a card gets when it starts repeating without a date:
// the first day of the rule from today on.
export const firstDue = (rule: Repeat, today: string): string => nextDue(rule, addDays(today, -1), today);

// suggest proposes a rule of that kind that fits a day (the card's date, or
// today): "every week" on its weekday, "every month" on its day.
export function suggest(kind: RepeatKind, day: string): Repeat {
  switch (kind) {
    case "week":
      return { every: "week", days: [weekday(day)] };
    case "month":
      return { every: "month", day: utc(day).getUTCDate() };
    default:
      return { every: kind };
  }
}
