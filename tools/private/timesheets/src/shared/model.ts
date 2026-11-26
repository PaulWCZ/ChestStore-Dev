import { AppError } from "@argentic/chest-app/client";
import { isDay } from "./days.ts";

// The rules of what a person writes, and the bounds of the tool. No
// framework, no database: tested alone.

export const limits = {
  clientName: 80,
  projectName: 80,
  taskName: 60,
  note: 500,
  tasksPerProject: 50,
  projectPeople: 500,
  projects: 2000,
  clients: 1000,
  rowsPerWeek: 40,
  // A deleted entry can be restored this long, then it is purged.
  keepDeleted: "30 days",
  // The longest period a report covers.
  reportDays: 366,
  // A timer running longer than this asks, on the next visit, when it stopped.
  forgottenHours: 10,
  // Money: an hourly rate up to 1,000,000.00; a budget up to 1,000,000,000.00.
  rateCents: 100_000_000,
  budgetCents: 100_000_000_000,
  budgetMinutes: 6_000_000,
  reminderMinMinutes: 60,
  reminderMaxMinutes: 4800,
} as const;

// The colours of projects: names the design turns into tokens.
export const colors = ["teal", "sky", "indigo", "violet", "rose", "coral", "amber", "olive"] as const;
export type Color = (typeof colors)[number];
export const isColor = (value: unknown): value is Color => typeof value === "string" && (colors as readonly string[]).includes(value);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === undefined && options.optional) return "";
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

// optionalId: an identifier, or nothing (null, "", 0, undefined).
export function optionalId(value: unknown): string | null {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") return null;
  return id(value);
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export function memberIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && memberPattern.test(v))) throw new AppError("invalid");
  const ids = [...new Set(value as string[])];
  if (ids.length > max) throw new AppError("too_many", { max });
  return ids;
}

// A day of time: a real date, from 2000 to a year after today.
export function day(value: unknown, today: string): string {
  if (!isDay(value)) throw new AppError("invalid");
  const latest = String(Number(today.slice(0, 4)) + 1) + today.slice(4);
  if (value < "2000-01-01" || value > latest) throw new AppError("invalid");
  return value;
}

// minutes of an entry: a whole number from 1 to a day.
export function minutes(value: unknown, options: { zero?: boolean } = {}): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (options.zero ? 0 : 1) || value > 1440) throw new AppError("bad_duration");
  return value;
}

// A sum of money in minor units (cents), or nothing.
export function cents(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new AppError("invalid");
  return value;
}

export function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AppError("invalid");
  return value;
}

// PostgreSQL gives bigint sums as strings; counts, as numbers here.
export const numeric = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
