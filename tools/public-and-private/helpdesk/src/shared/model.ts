// The rules of what people write, pure — no SDK, no server code: the
// islands use them too (src/shared/). The checks that refuse with a code
// are in src/lib/model.ts.
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
// (src/shared/hours.ts), or of the clock when the team counts every hour.
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

export type Status = "open" | "waiting" | "closed" | "spam";
export const statuses: readonly Status[] = ["open", "waiting", "closed", "spam"];
export const isStatus = (value: unknown): value is Status => typeof value === "string" && (statuses as readonly string[]).includes(value);

// The inbox's folders.
// "all" is every ticket but spam (a tag's tickets, from a ticket's page).
export const folders = ["unassigned", "mine", "open", "waiting", "closed", "spam", "all"] as const;
export type Folder = (typeof folders)[number];
export const isFolder = (value: unknown): value is Folder => typeof value === "string" && (folders as readonly string[]).includes(value);

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
