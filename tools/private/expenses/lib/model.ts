import { AppError } from "./app-error.ts";

// The rules of what a person writes, and the bounds of everything. No
// framework, no database: tested alone.

export const limits = {
  merchant: 120,
  note: 1000,
  place: 120,
  reason: 500,
  // Guests at a meal: 30 people of the Chest and 30 from outside at most.
  guests: 30,
  guestName: 120,
  categoryName: 60,
  // The company's name in a transfer file (SEPA: 70 characters).
  payer: 70,
  // The name on a bank account (SEPA: 70 characters).
  holder: 70,
  account: 20,
  fileName: 200,
  // A receipt: a photo or a PDF of 10 MiB at most.
  receiptSize: 10 << 20,
  // Most expenses one person sends at once, one decision covers.
  batch: 200,
  // A trip: 0.1 to 10,000 km.
  distanceTenths: 100_000,
  // One expense: 1,000,000.00 at most.
  amount: 100_000_000,
  categories: 50,
  // One export: this many expenses (CSV) and receipts (ZIP), and bytes of
  // receipts in one ZIP — above, the accountant exports per person.
  exportRows: 20_000,
  exportFiles: 5_000,
  exportBytes: 1 << 30,
} as const;

// The file types a receipt may have: what a phone camera gives, and PDF.
export const receiptTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
export const receiptExtension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
// Thumbnails exist for these (the Chest makes them).
export const thumbnailTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
  text = text.replace(/[‪-‮⁦-⁩]/gu, "").trim();
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

export function ids(value: unknown, max: number = limits.batch): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  const list = [...new Set(value.map(id))];
  if (list.length === 0) throw new AppError("nothing_selected");
  if (list.length > max) throw new AppError("too_many", { max });
  return list;
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export function memberId(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("invalid");
  return value;
}

// A day (YYYY-MM-DD) that exists, between 2000 and 2100.
export function day(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("date_invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("date_invalid");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("date_invalid");
  return value;
}

// A month (YYYY-MM).
export function month(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) throw new AppError("date_invalid");
  day(value + "-01");
  return value;
}

export function monthRange(value: string): { from: string; to: string } {
  const [y, m] = value.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: value + "-01", to: next + "-01" };
}

// An expense is spent on a day that has come (tomorrow is allowed: time
// zones).
export function spentOn(value: unknown, now = today()): string {
  const d = day(value);
  const tomorrow = new Date(Date.parse(now + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  if (d > tomorrow) throw new AppError("date_future");
  return d;
}

// Today in the Chest's time zone, as a day.
export function today(now = new Date(), timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// A distance typed in km ("12", "12,5", "12.5") in tenths of a km.
export function distanceTenths(value: unknown): number {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!/^\d{1,5}(\.\d)?$/u.test(text)) throw new AppError("distance_invalid");
  const tenths = Math.round(Number(text) * 10);
  if (tenths < 1 || tenths > limits.distanceTenths) throw new AppError("distance_invalid");
  return tenths;
}

// A percentage between 0 and 100.
export function percent(value: unknown): number {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) throw new AppError("invalid");
  return n;
}

// The expense statuses, and what the owner sees of each.
export const statuses = ["draft", "submitted", "approved", "paid"] as const;
export type Status = (typeof statuses)[number];
export const paidByValues = ["me", "company"] as const;
export type PaidBy = (typeof paidByValues)[number];

// A name for a file inside a ZIP or a download: ASCII letters, digits and
// dashes only ("Inès Moreau" → "Ines-Moreau").
export function slug(text: string, max = 40): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, max) || "x";
}
