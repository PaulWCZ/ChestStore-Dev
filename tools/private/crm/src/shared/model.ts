import { rawDateFormat } from "../i18n/format.ts";
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
  postcode: 20,
  city: 80,
  country: 80,
  url: 200,
  fileName: 200,
  attachments: 30,
  attachmentSize: 25 << 20,
  bulk: 500,
  pageSize: 100,
} as const;

// What people log by hand, and what the tool records by itself.
export const loggedKinds = ["call", "meeting", "email", "note"] as const;
export type LoggedKind = (typeof loggedKinds)[number];
export const isLoggedKind = (value: unknown): value is LoggedKind => typeof value === "string" && (loggedKinds as readonly string[]).includes(value);
export type ActivityKind = LoggedKind | "step" | "created" | "stage" | "won" | "lost" | "reopened" | "owner" | "unassigned" | "merged" | "form" | "booking";

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

// An email address is read by the package's field.email (src/lib/email.ts:
// server only, the package's fields do not run in the browser). Two
// addresses are the same person when their keys are equal: the whole
// address lower-cased (contacts_email indexes lower(email)).
export function emailKey(address: string): string {
  return address.toLowerCase();
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

// The day (YYYY-MM-DD) it is in a time zone. The Chest's today is
// lib/zone.ts (server only: it reads the Chest's zone).
export function dayIn(timeZone: string, now = new Date()): string {
  return rawDateFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
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
export function dueState(due: string, now: string): DueState {
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

// A SIREN (9 digits) or a SIRET (14), written with or without spaces.
export function siren(value: unknown): string {
  const text = clean(value ?? "", 30, { optional: true }).replace(/[\s.]/gu, "");
  if (text === "") return "";
  if (!/^([0-9]{9}|[0-9]{14})$/u.test(text)) throw new AppError("bad_siren");
  return text;
}

// An intra-community VAT number: two letters, then 2 to 13 letters or
// digits ("FR 40 303 265 045" → "FR40303265045"). Only its shape is checked.
export function vat(value: unknown): string {
  const text = clean(value ?? "", 30, { optional: true }).replace(/[\s.-]/gu, "").toUpperCase();
  if (text === "") return "";
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/u.test(text)) throw new AppError("bad_vat");
  return text;
}

// A time of day, "HH:MM" (24 hours), or nothing.
export function time(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(value)) throw new AppError("bad_time");
  return value;
}

// The times a next step offers: every half hour from 07:00 to 20:30 (a
// select, not a native field: those follow the browser's AM/PM).
export const stepTimes: string[] = Array.from({ length: 28 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

// The digits of a phone number as search compares them: "+33 (0)4 78…",
// "0033 4 78…" and "04 78…" are the same number (as crm_phone, in SQL).
export function phoneDigits(value: string): string {
  const v = value.replace(/\(\s*0\s*\)/gu, "");
  const digits = v.replace(/[^0-9]/gu, "");
  if (/^\s*\+\s*33/u.test(v)) return "0" + digits.slice(2);
  if (/^\s*0033/u.test(v)) return "0" + digits.slice(4);
  return digits;
}

// A day and a time of day in a time zone, as an instant
// ("2026-03-02", "14:30" in Europe/Paris → 13:30 UTC). In the Chest's
// zone: lib/zone.ts.
export function zonedIn(day: string, clock: string, timeZone: string): Date {
  const guess = Date.parse(`${day}T${clock}:00Z`);
  const offset = (at: number) => {
    const parts = Object.fromEntries(rawDateFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
    return Date.UTC(Number(parts["year"]), Number(parts["month"]) - 1, Number(parts["day"]), Number(parts["hour"]), Number(parts["minute"]), Number(parts["second"])) - at;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}
