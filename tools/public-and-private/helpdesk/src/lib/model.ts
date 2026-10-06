import { AppError } from "./app-error.ts";
import { limits } from "../shared/model.ts";

// What people write, checked on the server: a code for what is refused
// (empty, too_long, invalid_email…), never a sentence. The pure rules
// (bounds, kinds, priorities, folders) are in src/shared/model.ts, which
// the islands share; they are said again from here.
export * from "../shared/model.ts";

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

// A tag's name: one line, 30 characters at most.
export const tagName = (value: unknown): string => clean(value, limits.tag);

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
