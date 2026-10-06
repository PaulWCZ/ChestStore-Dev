import { AppError } from "./app-error.ts";
import { colors, durations, isColor, isLocationKind, locationKinds, reserved, slugify, type Color, type LocationKind } from "../shared/kinds.ts";

export { colors, durations, isColor, isLocationKind, locationKinds, slugify, type Color, type LocationKind };

// The rules of what people write, pure (tested alone; the browser uses
// them too).
export const limits = { title: 80, description: 1000, location: 300, welcome: 300, name: 120, email: 254, note: 2000, reason: 500, typesPerHost: 20 } as const;




export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

const address = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
export function email(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_email");
  const text = value.trim();
  if (text.length > limits.email || !address.test(text)) throw new AppError("invalid_email");
  return text;
}

// Addresses of pages: a host's (/camille-martin) and a type's
// (/camille-martin/first-call). Never one of the tool's own routes.
export function slug(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid");
  const text = value.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/u.test(text) || reserved.has(text)) throw new AppError("invalid");
  return text;
}


export function minutes(value: unknown, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new AppError("invalid");
  return n;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

// A phone number as people write it: "+33 6 12 34 56 78", "(514) 555-0101".
export function phone(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_phone");
  const text = value.replace(/\s+/gu, " ").trim();
  const digits = text.replace(/\D/gu, "");
  if (!/^\+?[0-9 ().-]{6,40}$/u.test(text) || digits.length < 6 || digits.length > 16) throw new AppError("invalid_phone");
  return text;
}
