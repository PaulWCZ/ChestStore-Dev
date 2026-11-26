import { AppError } from "./app-error.ts";

// The rules of what people write and how progress is counted. No framework,
// no database, browser-safe: tested alone (test/model.test.ts).

export const limits = {
  cycleName: 60,
  teamName: 60,
  title: 200,
  why: 2000,
  // A unit, or its two forms "customer/customers".
  unit: 41,
  note: 500,
  comment: 2000,
  learned: 2000,
  keyResultsPerObjective: 10,
  objectivesPerCycle: 500,
  teams: 100,
  viewers: 50,
  cycleDays: 400,
  // Values are stored with 4 decimals, within ±1,000,000,000,000.
  value: 1e12,
} as const;

// Days without a check-in after which a key result is "stale".
export const staleDays = 14;
// How long the author of a check-in may take it back.
export const undoMinutes = 30;

export const levels = ["company", "team", "personal"] as const;
export type Level = (typeof levels)[number];
export const isLevel = (value: unknown): value is Level => typeof value === "string" && (levels as readonly string[]).includes(value);

export const kinds = ["number", "percent", "money", "milestone"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

// Who sees an objective: everyone, its team (a group of the Chest), or
// some people — always its owner, its key results' owners and the admins.
export const visibilities = ["everyone", "team", "people"] as const;
export type Visibility = (typeof visibilities)[number];
export const isVisibility = (value: unknown): value is Visibility => typeof value === "string" && (visibilities as readonly string[]).includes(value);

// Confidence, from best to worst.
export const confidences = ["on_track", "at_risk", "off_track"] as const;
export type Confidence = (typeof confidences)[number];
export const isConfidence = (value: unknown): value is Confidence => typeof value === "string" && (confidences as readonly string[]).includes(value);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined && options.optional) return "";
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{3,}/gu, "\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}
export function optionalId(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : id(value);
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export const groupPattern = /^grp_[a-z2-7]{26}$/u;
export function memberId(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("invalid");
  return value;
}

// A day, "YYYY-MM-DD", between 2000 and 2100.
export function day(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid_date");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("invalid_date");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("invalid_date");
  return value;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}
// The Monday of the week of a day.
export function mondayOf(date: string): string {
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

// A cycle's dates: the end after the start, at most a bit more than a year.
export function cycleDates(starts: unknown, ends: unknown): { startsOn: string; endsOn: string } {
  const startsOn = day(starts), endsOn = day(ends);
  if (endsOn <= startsOn) throw new AppError("dates_order");
  if (daysBetween(startsOn, endsOn) > limits.cycleDays) throw new AppError("too_long_cycle", { max: limits.cycleDays });
  return { startsOn, endsOn };
}

// The calendar quarter of a day, and the next one: what "New cycle"
// suggests. `name` is "Q4 2026"; pages write it in the reader's words
// ("T4 2026" in French) from `quarter` and `year`.
export type Quarter = { name: string; quarter: number; year: number; startsOn: string; endsOn: string };
export function quarterOf(date: string): Quarter {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const q = Math.floor((m - 1) / 3);
  const startsOn = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const endsOn = new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10);
  return { name: `Q${q + 1} ${y}`, quarter: q + 1, year: y, startsOn, endsOn };
}
export function nextQuarter(after: string): Quarter {
  return quarterOf(addDays(quarterOf(after).endsOn, 1));
}

// Within this many days of a quarter's end, a first cycle is the next
// quarter: a company that starts Goals on 29 September plans Q4, not the
// 1 day left of Q3.
export const lateInQuarterDays = 14;

// What "Start" offers on a Chest without cycles, on a day of the Chest's
// calendar: the quarter to start (with the other one as a second choice
// late in a quarter).
export type Suggestion = { which: "current" | "next"; quarter: Quarter };
export function firstCycleChoices(today: string): { main: Suggestion; other: Suggestion | null } {
  const current = quarterOf(today);
  const left = daysBetween(today, current.endsOn);
  if (left < lateInQuarterDays) return { main: { which: "next", quarter: nextQuarter(today) }, other: { which: "current", quarter: current } };
  return { main: { which: "current", quarter: current }, other: null };
}

// Whether a cycle runs on a day (its first and last days included).
export const runsOn = (cycle: { startsOn: string; endsOn: string }, date: string): boolean => cycle.startsOn <= date && date <= cycle.endsOn;

// Where a cycle stands on a day: before, during (week n of m, days left), after.
export type CycleTime = { phase: "before" | "during" | "after"; week: number; weeks: number; daysLeft: number; elapsed: number };
export function cycleTime(cycle: { startsOn: string; endsOn: string }, today: string): CycleTime {
  const total = daysBetween(cycle.startsOn, cycle.endsOn) + 1;
  const weeks = Math.max(1, Math.ceil(total / 7));
  if (today < cycle.startsOn) return { phase: "before", week: 0, weeks, daysLeft: daysBetween(today, cycle.endsOn) + 1, elapsed: 0 };
  if (today > cycle.endsOn) return { phase: "after", week: weeks, weeks, daysLeft: 0, elapsed: 1 };
  const done = daysBetween(cycle.startsOn, today) + 1;
  return { phase: "during", week: Math.min(weeks, Math.floor((done - 1) / 7) + 1), weeks, daysLeft: total - done, elapsed: done / total };
}

// A value as typed by a person: "12", "12,5" (French), "1 200", "-3".
export function parseValue(value: unknown): number {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const text = value.trim().replace(/[\s  ]/gu, "").replace(/^\+/u, "");
    if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/u.test(text)) throw new AppError("invalid_number");
    n = Number(text.replace(",", "."));
  } else throw new AppError("invalid_number");
  if (!Number.isFinite(n) || Math.abs(n) > limits.value) throw new AppError("invalid_number");
  return Math.round(n * 10000) / 10000;
}

// The measure of a key result as a person set it, checked.
export type Measure = { kind: Kind; unit: string; start: number; target: number };
export function measure(input: { kind?: unknown; unit?: unknown; start?: unknown; target?: unknown }): Measure {
  if (!isKind(input.kind)) throw new AppError("invalid");
  if (input.kind === "milestone") return { kind: "milestone", unit: "", start: 0, target: 1 };
  const start = input.start === undefined || input.start === "" ? 0 : parseValue(input.start);
  const target = parseValue(input.target);
  if (start === target) throw new AppError("same_values");
  if (input.kind === "percent" && [start, target].some(v => v < -1000 || v > 1000)) throw new AppError("invalid_number");
  const unit = input.kind === "number" ? clean(input.unit ?? "", limits.unit, { optional: true }).replace(/\s*\/\s*/gu, "/") : "";
  return { kind: input.kind, unit, start, target };
}

// A new value for a key result of that kind (a milestone is 0 or 1).
export function checkValue(kind: Kind, value: unknown): number {
  if (kind === "milestone") {
    if (value === true || value === 1 || value === "1") return 1;
    if (value === false || value === 0 || value === "0") return 0;
    throw new AppError("invalid");
  }
  const n = parseValue(value);
  if (kind === "percent" && (n < -1000 || n > 1000)) throw new AppError("invalid_number");
  return n;
}

// Progress of a key result from its start to its target, 0 to 1 — a target
// below the start works too ("returns from 8 % to 3 %").
export function progress(start: number, target: number, current: number): number {
  if (target === start) return current === target ? 1 : 0;
  const p = (current - start) / (target - start);
  return Math.min(1, Math.max(0, p));
}

// An objective's progress: the weighted mean of its key results; null
// without any.
export function objectiveProgress(keyResults: readonly { progress: number; weight: number }[]): number | null {
  const total = keyResults.reduce((n, k) => n + k.weight, 0);
  if (total === 0) return null;
  return keyResults.reduce((n, k) => n + k.progress * k.weight, 0) / total;
}

// The worst confidence of a set (null: nobody checked in yet).
export function worst(values: readonly (Confidence | null)[]): Confidence | null {
  let found: Confidence | null = null;
  for (const v of values) if (v && (found === null || confidences.indexOf(v) > confidences.indexOf(found))) found = v;
  return found;
}

// A percentage as people read it: whole numbers, 0 to 100.
export const percent = (p: number | null): number | null => (p === null ? null : Math.round(p * 100));

// Stale: nothing heard of a key result that is not done for staleDays.
export function isStale(lastActivity: Date, done: boolean, closed: boolean, now: Date): boolean {
  return !closed && !done && now.getTime() - lastActivity.getTime() > staleDays * 86400000;
}

// A retrospective's score: 0 to 1 in steps of 0.1, or a percentage written
// "70" / "70 %".
export function score(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let n: number;
  if (typeof value === "string") {
    const text = value.replace(/%/gu, "").trim();
    n = parseValue(text);
    if (/%/u.test(value) || n > 1) n = n / 100;
  } else if (typeof value === "number") n = value;
  else throw new AppError("invalid_score");
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new AppError("invalid_score");
  return Math.round(n * 100) / 100;
}
