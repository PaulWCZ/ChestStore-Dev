import { AppError } from "./app-error.ts";

// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone.

export const limits = {
  boardName: 80,
  columnName: 60,
  labelName: 40,
  title: 300,
  description: 20000,
  checkItem: 300,
  comment: 5000,
  fileName: 200,
  columnsPerBoard: 30,
  labelsPerBoard: 30,
  cardsPerBoard: 5000,
  checkItemsPerCard: 100,
  assigneesPerCard: 20,
  attachmentsPerCard: 30,
  attachmentSize: 25 << 20,
  boardPeople: 200,
  checklistsPerCard: 10,
  checklistTitle: 80,
  fieldsPerBoard: 20,
  fieldName: 40,
  fieldOptions: 30,
  fieldOption: 40,
  fieldValue: 500,
} as const;

// The colours of boards and labels: names the design turns into tokens.
export const colors = ["sun", "tomato", "berry", "grape", "sky", "sea", "leaf", "sand", "slate"] as const;
export type Color = (typeof colors)[number];
export const isColor = (value: unknown): value is Color => typeof value === "string" && (colors as readonly string[]).includes(value);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
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
export const groupPattern = /^grp_[a-z2-7]{26}$/u;
export function memberIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && memberPattern.test(v))) throw new AppError("invalid");
  const ids = [...new Set(value as string[])];
  if (ids.length > max) throw new AppError("too_many", { max });
  return ids;
}

// A due date is a day (YYYY-MM-DD) or nothing.
export function day(value: unknown): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("invalid");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("invalid");
  return value;
}

// A time of day, 24-hour "HH:MM", or nothing.
export function time(value: unknown): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(value)) throw new AppError("invalid");
  return value;
}

// A board's own fields: text, a number, or one choice among options.
export const fieldKinds = ["text", "number", "choice"] as const;
export type FieldKind = (typeof fieldKinds)[number];
export const isFieldKind = (value: unknown): value is FieldKind => typeof value === "string" && (fieldKinds as readonly string[]).includes(value);

// fieldValue checks what a card holds for a field: a number is written the
// way it was typed but must read as one ("12", "12.5", "12,5", "-3");
// a choice is one of the options; empty means none.
export function fieldValue(kind: FieldKind, options: readonly string[], value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = clean(value, limits.fieldValue, { optional: true });
  if (text === "") return null;
  if (kind === "number" && !/^-?\d{1,15}([.,]\d{1,6})?$/u.test(text.replace(/[\s\u202f\u00a0]/gu, ""))) throw new AppError("invalid");
  if (kind === "number") return text.replace(/[\s\u202f\u00a0]/gu, "").replace(",", ".");
  if (kind === "choice" && !options.includes(text)) throw new AppError("invalid");
  return text;
}

// Today in the Chest's time zone, as a day.
export function today(now = new Date(), timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// When a due day stands, seen from today.
export type DueState = "late" | "today" | "soon" | "later" | "none";
export function dueState(due: string | null, now = today()): DueState {
  if (!due) return "none";
  if (due < now) return "late";
  if (due === now) return "today";
  const days = (Date.parse(due) - Date.parse(now)) / 86400000;
  return days <= 7 ? "soon" : "later";
}

// Mentions: "@" followed by what the composer inserted; the ids come with
// the comment, checked on the server.
export function mentionIds(value: unknown): string[] {
  if (value === undefined) return [];
  return memberIds(value, 20);
}

// The board templates offered at creation: column keys, named in the
// catalogue of the creator's language.
export const templates = {
  simple: [{ key: "todo", done: false }, { key: "doing", done: false }, { key: "done", done: true }],
  project: [{ key: "ideas", done: false }, { key: "todo", done: false }, { key: "doing", done: false }, { key: "review", done: false }, { key: "done", done: true }],
  onboarding: [{ key: "before", done: false }, { key: "firstDay", done: false }, { key: "firstWeek", done: false }, { key: "done", done: true }],
  empty: [],
} as const;
export type Template = keyof typeof templates;
export const isTemplate = (value: unknown): value is Template => typeof value === "string" && Object.hasOwn(templates, value);
