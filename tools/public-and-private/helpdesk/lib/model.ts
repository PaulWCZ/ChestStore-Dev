import { AppError } from "./app-error.ts";

// The rules of what people write, pure (tested alone, used in the browser
// too).
export const limits = {
  subject: 200,
  body: 20000,
  publicBody: 10000,
  name: 120,
  email: 254,
  savedTitle: 80,
  savedBody: 5000,
  page: 50,
  fileName: 200,
  attachmentSize: 20 << 20,
  // A received email: the Chest keeps 20 attachments at most.
  attachmentsPerMessage: 20,
  // Files a customer adds to the form or to a message (the Chest takes 10
  // MiB at most from a visitor), and those an agent adds to an answer (the
  // Chest's mail carries 10 MiB a message).
  filesPerMessage: 5,
  fileSize: 10 << 20,
  tag: 30,
  tagsPerTicket: 10,
  tags: 200,
} as const;

// The files people may add: what customers send to support (photos,
// documents, a spreadsheet), never a program or a web page. The Chest
// checks that images, PDFs and archives (docx, xlsx) start with the bytes
// of their type; the tool serves every file as a download.
export const fileTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
} as const;
export type FileType = keyof typeof fileTypes;
export const isFileType = (value: unknown): value is FileType => typeof value === "string" && Object.hasOwn(fileTypes, value);
// What the browser's file picker offers (types and extensions: some
// systems know a file only by its extension).
export const fileAccept = [...Object.keys(fileTypes), ...Object.values(fileTypes).map(e => "." + e), ".jpeg"].join(",");

// checkFile says why a file cannot be added, or null: its type, its size.
export function checkFile(type: unknown, size: unknown): "file_type" | "file_too_large" | null {
  if (!isFileType(type)) return "file_type";
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1) return "file_type";
  return size > limits.fileSize ? "file_too_large" : null;
}

// A file's name as people see it: one line, no folder, never empty.
export function fileName(value: unknown, fallback = "file"): string {
  let text = "";
  try {
    text = clean(value, limits.fileName, { optional: true });
  } catch {
    text = [...String(typeof value === "string" ? value : "")].slice(0, limits.fileName).join("").replace(/\p{Cc}/gu, "").trim();
  }
  text = text.replace(/[/\\]/gu, "_").replace(/^\.+/u, "");
  return text || fallback;
}

// Priority, in plain words; normal unless someone says otherwise.
export const priorities = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof priorities)[number];
export const isPriority = (value: unknown): value is Priority => typeof value === "string" && (priorities as readonly string[]).includes(value);

// How the inbox is sorted: the most urgent first (the default; among
// equals, who has waited longest), who has waited longest, or the latest
// activity first.
export const sorts = ["priority", "waiting", "recent"] as const;
export const defaultSort = "priority";
export type Sort = (typeof sorts)[number];
export const isSort = (value: unknown): value is Sort => typeof value === "string" && (sorts as readonly string[]).includes(value);

// "Waiting since": how long a customer has waited for an answer, in the
// largest whole unit, and whether it is past the team's threshold (hours;
// 0: never highlighted). The minutes are those of the working hours
// (lib/hours.ts), or of the clock when the team counts every hour.
export const lateChoices = [0, 1, 2, 4, 8, 24, 48, 72] as const;
export const defaultLateHours = 24;
export function waitedFor(minutes: number): { unit: "minute" | "hour" | "day"; count: number } {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return { unit: "minute", count: Math.max(1, m) };
  if (m < 48 * 60) return { unit: "hour", count: Math.floor(m / 60) };
  return { unit: "day", count: Math.floor(m / 1440) };
}
export const lateAfter = (minutes: number, lateHours: number) => lateHours > 0 && minutes >= lateHours * 60;
export function waited(since: Date | string, now = new Date()): { unit: "minute" | "hour" | "day"; count: number } {
  return waitedFor((now.getTime() - new Date(since).getTime()) / 60000);
}
export function isLate(since: Date | string | null, lateHours: number, now = new Date()): boolean {
  return since !== null && lateAfter((now.getTime() - new Date(since).getTime()) / 60000, lateHours);
}

// A tag's name: one line, 30 characters at most.
export const tagName = (value: unknown): string => clean(value, limits.tag);

export type Status = "open" | "waiting" | "closed" | "spam";
export const statuses: readonly Status[] = ["open", "waiting", "closed", "spam"];
export const isStatus = (value: unknown): value is Status => typeof value === "string" && (statuses as readonly string[]).includes(value);

// The inbox's folders.
// "all" is every ticket but spam (a tag's tickets, from a ticket's page).
export const folders = ["unassigned", "mine", "open", "waiting", "closed", "spam", "all"] as const;
export type Folder = (typeof folders)[number];
export const isFolder = (value: unknown): value is Folder => typeof value === "string" && (folders as readonly string[]).includes(value);

export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{4,}/gu, "\n\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

// A plain email address (no name, no comment), as the Chest's mail sends
// to; kept lowercase for comparisons, as written for display.
const address = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
export function email(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_email");
  const text = value.trim();
  if (text.length > limits.email || !address.test(text)) throw new AppError("invalid_email");
  return text;
}

const numberPattern = /^[1-9][0-9]{0,8}$/u;
export function ticketNumber(value: unknown): number {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !numberPattern.test(text)) throw new AppError("not_found");
  return Number(text);
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

// The subject of an email about a ticket carries its number: "[#1042]".
export const subjectTag = (n: number) => `[#${n}]`;
export function numberInSubject(subject: string): number | null {
  const m = /\[#([1-9][0-9]{0,8})\]/u.exec(subject);
  return m ? Number(m[1]) : null;
}

// Saved replies fill {customer} and {agent}.
export function fillReply(text: string, values: { customer: string; agent: string }): string {
  return text.replace(/\{(customer|agent)\}/gu, (_, key: "customer" | "agent") => values[key]);
}

// A merge, as a ticket's event records it: "merged:<number it came
// from>:<this ticket's state before>" (what Undo puts back).
export const mergedEvent = (from: number, before: Status) => `merged:${from}:${before}`;
export function readMerged(body: string): { number: number; before: Status | null } | null {
  const m = /^merged:([1-9][0-9]{0,8})(?::(open|waiting|closed|spam))?$/u.exec(body);
  return m ? { number: Number(m[1]), before: (m[2] as Status | undefined) ?? null } : null;
}
