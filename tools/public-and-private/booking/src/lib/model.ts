import { AppError } from "./app-error.ts";

// The rules of what people write, pure (tested alone; the browser uses
// them too).
export const limits = { title: 80, description: 1000, location: 300, welcome: 300, name: 120, email: 254, note: 2000, reason: 500, typesPerHost: 20 } as const;

export const colors = ["sky", "sea", "leaf", "sun", "tomato", "berry", "grape", "slate"] as const;
export type Color = (typeof colors)[number];
export const isColor = (v: unknown): v is Color => typeof v === "string" && (colors as readonly string[]).includes(v);

export const locationKinds = ["place", "phone", "video", "other"] as const;
export type LocationKind = (typeof locationKinds)[number];
export const isLocationKind = (v: unknown): v is LocationKind => typeof v === "string" && (locationKinds as readonly string[]).includes(v);

// Durations and steps a host picks from.
export const durations = [15, 20, 30, 45, 60, 90, 120] as const;

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
const reserved = new Set(["chest", "chest-events", "chest-schedules", "chest-mail", "chest-checks", "chest-webhooks", "chest-jobs", "b", "feed", "lang", "api", "actions", "assets", "look.css", "_next", "_chest", "icon.svg", "favicon.ico", "robots.txt"]);
export function slug(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid");
  const text = value.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/u.test(text) || reserved.has(text)) throw new AppError("invalid");
  return text;
}

// A slug from a name: "Léa Dubois" → "lea-dubois".
export function slugify(text: string): string {
  const base = text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40).replace(/-+$/u, "");
  return base.length >= 1 && !reserved.has(base) ? base : "page";
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
