import { AppError } from "./app-error.ts";

// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.

export const limits = {
  name: 120,
  serial: 80,
  supplier: 80,
  notes: 4000,
  place: 80,
  condition: 1000,
  problem: 1000,
  categoryName: 40,
  categories: 40,
  items: 20000,
  seats: 100000,
  price: 100000000000,
  photoSize: 10 << 20,
  importBytes: 5 << 20,
  importRows: 5000,
  labels: 240,
  search: 100,
  // Fields per category (IMEI, RAM…) and their values.
  fieldName: 40,
  fieldValue: 200,
  fieldsPerCategory: 20,
  // Items with a quantity.
  quantity: 1000000,
  // Several identical items added at once.
  bulk: 100,
  request: 500,
  openRequests: 10,
  remark: 1000,
  charter: 8000,
  ref: 80,
  invoiceSize: 10 << 20,
  // Items per page of the list.
  page: 100,
} as const;

// What an item can be. "in_use" is only reached by giving it to someone
// (or a place); the others are chosen.
export const statuses = ["in_stock", "in_use", "in_repair", "lost", "retired"] as const;
export type Status = (typeof statuses)[number];
export const isStatus = (value: unknown): value is Status => typeof value === "string" && (statuses as readonly string[]).includes(value);
export const chosenStatuses = ["in_stock", "in_repair", "lost", "retired"] as const;
export type ChosenStatus = (typeof chosenStatuses)[number];
export const isChosenStatus = (value: unknown): value is ChosenStatus => typeof value === "string" && (chosenStatuses as readonly string[]).includes(value);

// The built-in categories and the icons a category may wear (drawn in
// components/icons.tsx, named in the catalogues).
export const categoryKeys = ["laptop", "phone", "screen", "accessory", "licence", "key", "vehicle", "other", "consumable"] as const;
export type CategoryKey = (typeof categoryKeys)[number];
export const icons = ["laptop", "phone", "screen", "tablet", "keyboard", "headset", "licence", "key", "badge", "car", "printer", "camera", "chair", "tool", "plug", "box"] as const;
export type IconName = (typeof icons)[number];
export const isIcon = (value: unknown): value is IconName => typeof value === "string" && (icons as readonly string[]).includes(value);

// What a category holds: things one by one (asset), licences and
// subscriptions with seats (licence), or things counted in bulk — cables,
// toner, badges — with a quantity (consumable).
export const kinds = ["asset", "licence", "consumable"] as const;
export type Kind = (typeof kinds)[number];
export const isKind = (value: unknown): value is Kind => typeof value === "string" && (kinds as readonly string[]).includes(value);

// The type of a field a manager adds to a category.
export const fieldTypes = ["text", "number", "date"] as const;
export type FieldType = (typeof fieldTypes)[number];
export const isFieldType = (value: unknown): value is FieldType => typeof value === "string" && (fieldTypes as readonly string[]).includes(value);

// fieldValue reads what a person wrote in a field of that type: a text, a
// number ("16", "2,5" → "2.5"), a day. Empty is null.
export function fieldValue(type: FieldType, value: unknown): string | null {
  const text = optional(value, limits.fieldValue);
  if (text === null) return null;
  if (type === "number") {
    const n = text.replace(/\s/gu, "").replace(",", ".");
    if (!/^-?\d{1,12}(\.\d{1,6})?$/u.test(n)) throw new AppError("invalid_field");
    return String(Number(n));
  }
  if (type === "date") {
    try {
      return day(text);
    } catch {
      throw new AppError("invalid_field");
    }
  }
  return text;
}

// A count: a whole number from min to the limit.
export function count(value: unknown, min = 0, max: number = limits.quantity): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,7}\s*$/u.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError("invalid_quantity", { max });
  return n;
}

export const periods = ["month", "year"] as const;
export type Period = (typeof periods)[number];

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (value === null || value === undefined) value = "";
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.replace(/\n{3,}/gu, "\n\n").trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

// optional: a cleaned text, or null when left empty.
export function optional(value: unknown, max: number, options: { multiline?: boolean } = {}): string | null {
  const text = clean(value, max, { ...options, optional: true });
  return text === "" ? null : text;
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
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("invalid");
  return value;
}

// A day (YYYY-MM-DD) or nothing.
export function day(value: unknown): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("invalid");
  const year = date.getUTCFullYear();
  if (year < 1980 || year > 2100) throw new AppError("invalid");
  return value;
}

export function addDays(dayText: string, days: number): string {
  return new Date(Date.parse(dayText + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}

export function addMonths(dayText: string, months: number): string {
  const d = new Date(dayText + "T00:00:00Z");
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

// How far ahead the tool warns about a warranty or a renewal.
export const soonDays = 60;
export type Ending = "past" | "soon" | "later" | "none";
export function ending(until: string | null, now: string): Ending {
  if (!until) return "none";
  const days = daysBetween(now, until);
  if (days < 0) return "past";
  return days <= soonDays ? "soon" : "later";
}

// An asset tag as a person types it: letters, digits and . _ / -, up to 32.
const tagPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/u;
export function tag(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid");
  const text = value.trim().replace(/\s+/gu, "-");
  if (!tagPattern.test(text)) throw new AppError("invalid_tag");
  return text;
}
export const tagPrefix = "EQ-";
export const makeTag = (n: number) => tagPrefix + String(n).padStart(4, "0");

// The tags that follow a tag a person chose, for several items added at
// once: "LAP-009" → "LAP-010", "LAP-011"… (the digits at its end count up,
// keeping their width). A tag without digits at its end has no series.
export function tagSeries(first: string, n: number): string[] {
  const m = /^(.*?)(\d+)$/u.exec(first);
  if (!m) {
    if (n === 1) return [first];
    throw new AppError("tag_series");
  }
  const [, head, digits] = m as unknown as [string, string, string];
  const start = Number(digits);
  return Array.from({ length: n }, (_, k) => tag(head + String(start + k).padStart(digits.length, "0")));
}

// Money as a person writes it ("1 299,90", "1,299.90", "€ 45"), in cents.
export function money(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new AppError("invalid_money");
    return bound(Math.round(value * 100));
  }
  if (typeof value !== "string") throw new AppError("invalid_money");
  let text = value.replace(/[\s  ']/gu, "").replace(/[€$£]|EUR|USD|GBP|CHF|CAD|HT|TTC/giu, "");
  if (text === "") return null;
  if (!/^\d[\d.,]*$/u.test(text)) throw new AppError("invalid_money");
  const lastComma = text.lastIndexOf(","), lastDot = text.lastIndexOf(".");
  const decimal = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  if (decimal) {
    const [whole, fraction = ""] = [text.slice(0, text.lastIndexOf(decimal)), text.slice(text.lastIndexOf(decimal) + 1)];
    // "1,299" or "1.299": a group of three digits is thousands, not cents.
    const other = decimal === "," ? "." : ",";
    if (fraction.length === 3 && !text.includes(other)) text = text.split(decimal).join("");
    else if (fraction.length > 2 || whole.includes(decimal)) throw new AppError("invalid_money");
    else text = whole.replace(/[.,]/gu, "") + "." + fraction;
  }
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw new AppError("invalid_money");
  return bound(Math.round(amount * 100));
}
function bound(cents: number): number {
  if (cents < 0 || cents > limits.price) throw new AppError("invalid_money");
  return cents;
}

export function seatsCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,6}\s*$/u.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > limits.seats) throw new AppError("invalid_seats");
  return n;
}

// fold writes a text for comparing: lower case, no accents, single spaces.
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}
