import { AppError } from "./app-error.ts";

// The rules of what a person writes, and the shapes pages receive. No
// framework, no database: tested alone. Safe in the browser.

export const limits = {
  name: 160,
  website: 200,
  phone: 40,
  address: 300,
  industry: 80,
  title: 120,
  dealTitle: 160,
  email: 254,
  notes: 5000,
  tag: 30,
  tags: 20,
  stageName: 40,
  stages: 12,
  reason: 300,
  body: 5000,
  step: 200,
  query: 100,
  importRows: 5000,
  importBytes: 5 << 20,
  maxCents: 100_000_000_000,
} as const;

// What people log by hand, and what the tool records by itself.
export const loggedKinds = ["call", "meeting", "email", "note"] as const;
export type LoggedKind = (typeof loggedKinds)[number];
export const isLoggedKind = (value: unknown): value is LoggedKind => typeof value === "string" && (loggedKinds as readonly string[]).includes(value);
export type ActivityKind = LoggedKind | "step" | "created" | "stage" | "won" | "lost" | "reopened" | "owner" | "unassigned";

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
// optionalId: an identifier, or nothing ("", null, undefined).
export function optionalId(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : id(value);
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
// owner: a member id, or nobody (null: "unassigned").
export function owner(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("invalid");
  return value;
}

// An address is kept as written, lower-cased; only its shape is checked.
export function email(value: unknown): string {
  const text = clean(value ?? "", limits.email, { optional: true }).toLowerCase();
  if (text === "") return "";
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/u.test(text)) throw new AppError("bad_email");
  return text;
}

// A website: a domain or an http(s) address, nothing a browser would run.
export function website(value: unknown): string {
  const text = clean(value ?? "", limits.website, { optional: true });
  if (text === "") return "";
  const bare = text.replace(/^https?:\/\//iu, "");
  if (/\s/u.test(text) || /^[a-z][a-z0-9+.-]*:/iu.test(bare) || !/^[^/?#.]+(\.[^/?#.]+)+([/?#].*)?$/u.test(bare)) throw new AppError("invalid");
  return text.replace(/\/$/u, "");
}

// The address a website link opens: always http(s).
export function websiteHref(value: string): string {
  return /^https?:\/\//iu.test(value) ? value : "https://" + value;
}

// The domain of an address or a website, for duplicates ("acme.fr").
export function domainOf(value: string): string {
  const text = value.toLowerCase().trim();
  const host = text.includes("@") ? text.split("@").pop()! : text.replace(/^https?:\/\//u, "").split(/[/?#]/u)[0]!;
  return host.replace(/^www\./u, "");
}

// Free-mail domains say nothing about a company.
export const freeMail = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "icloud.com", "me.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "proton.me", "protonmail.com", "gmx.com", "gmx.fr", "aol.com", "bbox.fr", "neuf.fr"]);

// A phone number as people write it: digits and + ( ) . - / spaces.
export function phone(value: unknown): string {
  const text = clean(value ?? "", limits.phone, { optional: true });
  if (text !== "" && (!/^[0-9+().\-/\s]+$/u.test(text) || !/[0-9]/u.test(text))) throw new AppError("invalid");
  return text;
}

// The link a phone opens: the dialler (tel:), digits and a leading +.
export function phoneHref(value: string): string {
  return "tel:" + value.replace(/[^0-9+]/gu, "");
}

// Tags: a list, or words separated by commas; each once whatever its case.
export function tags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;]/u) : value === undefined || value === null ? [] : null;
  if (list === null) throw new AppError("invalid");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") throw new AppError("invalid");
    const tag = item.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "").trim().replace(/^#/u, "").trim();
    if (tag === "") continue;
    if ([...tag].length > limits.tag) throw new AppError("too_long", { max: limits.tag });
    const key = tag.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  if (out.length > limits.tags) throw new AppError("too_many", { max: limits.tags });
  return out;
}

// A day (YYYY-MM-DD) or nothing.
export function day(value: unknown, options: { required?: boolean } = {}): string | null {
  if (value === null || value === "" || value === undefined) {
    if (options.required) throw new AppError("bad_date");
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("bad_date");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("bad_date");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("bad_date");
  return value;
}

// Today in the Chest's time zone, as a day.
export function today(now = new Date(), timeZone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// addDays moves a day by n days; nextWorkday skips Saturday and Sunday.
export function addDays(from: string, n: number): string {
  const date = new Date(from + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
export function nextWorkday(from: string, n = 1): string {
  let d = addDays(from, n);
  while ([0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}

// The first and last day of the month of a day.
export function monthOf(from: string): { first: string; last: string } {
  const first = from.slice(0, 8) + "01";
  const next = new Date(first + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return { first, last: next.toISOString().slice(0, 10) };
}

// When a day stands, seen from today.
export type DueState = "late" | "today" | "soon" | "later";
export function dueState(due: string, now = today()): DueState {
  if (due < now) return "late";
  if (due === now) return "today";
  return due <= addDays(now, 7) ? "soon" : "later";
}

// The default stages have a key; a stage's name is its own, or the key's
// words in the reader's language.
export const stageKeys = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type StageKey = (typeof stageKeys)[number];
export type Stage = { id: string; key: StageKey | null; name: string | null; kind: "open" | "won" | "lost"; probability: number; position: string };
export function stageName(stage: Pick<Stage, "key" | "name">, words: Record<StageKey, string>): string {
  return stage.name ?? (stage.key ? words[stage.key] : "");
}
