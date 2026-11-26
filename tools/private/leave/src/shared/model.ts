import { AppError } from "@argentic/chest-app/client";
import { isDay, type Day } from "./calendar.ts";

// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.

export const limits = {
  note: 300,
  reason: 300,
  typeName: 40,
  employeeNumber: 30,
  types: 20,
  adjustment: 366,
  perYear: 60,
  importRows: 2000,
  importBytes: 512 * 1024,
  // A request may start a year back (a sick day declared late, leave
  // forgotten) and end two years ahead at most, and last a year at most.
  pastDays: 366,
  futureDays: 731,
  spanDays: 366,
} as const;

// The colours of leave types: names the design turns into tokens.
export const colors = ["sky", "mint", "peach", "lilac", "sun", "rose", "sand", "sea"] as const;
export type Color = (typeof colors)[number];
export const isColor = (value: unknown): value is Color => typeof value === "string" && (colors as readonly string[]).includes(value);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined || value === null) {
    if (options.optional) return "";
    throw new AppError("empty");
  }
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
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

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export function memberId(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("not_found");
  return value;
}

// day reads a calendar day (YYYY-MM-DD, 2000 to 2100).
export function day(value: unknown): Day {
  if (!isDay(value)) throw new AppError("invalid");
  return value;
}

export function optionalDay(value: unknown): Day | null {
  if (value === null || value === undefined || value === "") return null;
  return day(value);
}

// A number of days: a multiple of ½ within ±max (adjustments), or ≥ 0.
export function halfDays(value: unknown, max: number, options: { signed?: boolean } = {}): number {
  const n = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new AppError("invalid");
  if (Math.abs(n) > max || (!options.signed && n < 0)) throw new AppError("invalid");
  if (Math.round(n * 2) / 2 !== n) throw new AppError("invalid");
  return n;
}

// A number of days with two decimals (opening balances, yearly amounts).
export function decimalDays(value: unknown, max: number, options: { signed?: boolean } = {}): number {
  const n = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new AppError("invalid");
  if (Math.abs(n) > max || (!options.signed && n < 0)) throw new AppError("invalid");
  return Math.round(n * 100) / 100;
}

// numeric reads a PostgreSQL numeric (a string for the driver) as a number.
export const numeric = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

// The last day payroll's balances file may be asked for: the end of next
// month (payroll is prepared before the month ends; a later day is a
// guess, not a projection).
export function lastPayrollDay(today: Day): Day {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return new Date(Date.UTC(next[0]!, next[1]!, 0)).toISOString().slice(0, 10);
}
