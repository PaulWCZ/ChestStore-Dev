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
  attachmentsPerMessage: 10,
} as const;

export type Status = "open" | "waiting" | "closed" | "spam";
export const statuses: readonly Status[] = ["open", "waiting", "closed", "spam"];
export const isStatus = (value: unknown): value is Status => typeof value === "string" && (statuses as readonly string[]).includes(value);

// The inbox's folders.
export const folders = ["unassigned", "mine", "open", "waiting", "closed", "spam"] as const;
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
