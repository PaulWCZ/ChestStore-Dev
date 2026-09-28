import { AppError } from "./app-error.ts";

// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.

export const limits = {
  title: 80,
  team: 60,
  office: 60,
  phone: 30,
  pronouns: 30,
  bio: 600,
  skill: 40,
  skills: 12,
  templateName: 80,
  itemText: 200,
  itemsPerTemplate: 60,
  itemsPerJourney: 100,
  templates: 50,
  importRows: 2000,
  importBytes: 2 << 20,
} as const;

// How long a departed person's profile is kept (to restore it if they come
// back), then purged; and how recent a start makes someone "new".
export const keepLeftDays = 30;
export const newcomerDays = 30;

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
  if (options.multiline) text = text.replace(/\n{3,}/gu, "\n\n");
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

// A day (YYYY-MM-DD), or nothing when optional.
export function day(value: unknown, options: { optional?: boolean } = {}): string | null {
  if (value === null || value === "" || value === undefined) {
    if (options.optional) return null;
    throw new AppError("empty");
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("invalid");
  const year = date.getUTCFullYear();
  if (year < 1950 || year > 2100) throw new AppError("invalid");
  return value;
}

// A moment as a day in a time zone (the Chest's: lib/zone.ts).
export function today(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(value: string, days: number): string {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

// A work phone as people write it: digits, spaces and + ( ) . - /; at least
// three digits.
export function phone(value: unknown): string {
  const text = clean(value, limits.phone, { optional: true });
  if (text === "") return "";
  if (!/^[0-9+()./\s-]+$/u.test(text) || (text.match(/\d/gu)?.length ?? 0) < 3) throw new AppError("invalid");
  return text;
}

// "Ask me about": a few short topics, each once (case and accents aside).
export function skills(value: unknown): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  const found: string[] = [];
  const keys = new Set<string>();
  for (const item of value) {
    const text = clean(item, limits.skill, { optional: true });
    if (text === "") continue;
    const key = fold(text);
    if (keys.has(key)) continue;
    keys.add(key);
    found.push(text);
  }
  if (found.length > limits.skills) throw new AppError("too_many", { max: limits.skills });
  return found;
}

// A birthday is a day and a month ("MM-DD"), never a year; null hides it.
export function birthday(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "object") throw new AppError("invalid");
  const { month, day: d } = value as { month?: unknown; day?: unknown };
  const m = Number(month), n = Number(d);
  if (!Number.isInteger(m) || !Number.isInteger(n) || m < 1 || m > 12 || n < 1) throw new AppError("invalid");
  const longest = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
  if (n > longest) throw new AppError("invalid");
  return String(m).padStart(2, "0") + "-" + String(n).padStart(2, "0");
}

// fold writes a text for comparing: lower case, no accents, single spaces.
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

// Checklists.
export const kinds = ["onboarding", "offboarding"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

export const itemRoles = ["person", "manager", "hr", "member"] as const;
export type ItemRole = (typeof itemRoles)[number];
export const isItemRole = (value: unknown): value is ItemRole => typeof value === "string" && (itemRoles as readonly string[]).includes(value);

// The days a template item may fall on, as pickers offer them (the server
// accepts any day in the range).
export const offsets = [-30, -14, -7, -3, -1, 0, 1, 2, 7, 14, 30, 60, 90] as const;
export function offset(value: unknown): number {
  const n = typeof value === "string" && /^-?\d{1,3}$/u.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < -90 || n > 365) throw new AppError("invalid");
  return n;
}

// When an item is due, seen from today.
export type DueState = "late" | "today" | "soon" | "later";
export function dueState(due: string, now: string): DueState {
  if (due < now) return "late";
  if (due === now) return "today";
  return daysBetween(now, due) <= 7 ? "soon" : "later";
}
