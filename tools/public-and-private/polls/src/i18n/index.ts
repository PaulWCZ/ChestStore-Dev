import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The tool's languages: English first (the source, the default and the
// fallback), French second. A new language is one file of the same shape
// and its code here; nothing else names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
// Each named in itself (the public part's switch).
export const languageNames: Record<Locale, string> = { en: "English", fr: "Français" };

type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };
const catalogues: Record<Locale, Catalogue> = { en, fr };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);
export const words = (locale: Locale): Catalogue => catalogues[locale];
// The same, by the name Polls' services use.
export const catalogue = words;

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : "en");

// A visitor's language on the public part: their choice (the cookie the
// switch sets), else the first of Accept-Language the tool speaks, else
// the Chest's own language, else English.
export function publicLocale(cookie: string | undefined, accept: string | null | undefined, chestLanguage?: string): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (accept ?? "").split(",").slice(0, 16).map((part, index) => {
    const [tag = "", ...params] = part.split(";").map(p => p.trim());
    const q = params.find(p => p.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
  }).filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(chestLanguage);
}

// fill puts values in a text's {placeholders}.
export const fill = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export const intl = (locale: string): string => (locale === "en" ? "en-GB" : locale);

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page) piles up hundreds of MiB before a GC frees it. Each
// is made once per language, zone and style, and kept.
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.ListFormat;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
// A date format of a language tag ("en-GB", "fr") in a zone, made once.
export const dateFormat = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { ...style, timeZone }));
export const numberFormat = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat => once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));
const pluralRules = (tag: string) => once(`p|${tag}`, () => new Intl.PluralRules(tag));
const relativeFormat = (tag: string) => once(`r|${tag}`, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
const listFormat = (tag: string) => once(`l|${tag}`, () => new Intl.ListFormat(tag, { type: "conjunction" }));

// plural picks the form of a { zero?, one, other } entry for n in that
// language, then fills {count} (written in the language) and the values.
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(tag).select(n) === "one" ? forms.one : forms.other;
  return fill(form, { count: numberFormat(tag).format(n), ...values });
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: string, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = relativeFormat(intl(locale));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// How a reader writes dates, times, numbers, amounts and plurals: their
// language, their time zone (a member's own; the Chest's for a visitor),
// the Chest's currency. Made on the server for each request: a page is
// sent already written, never formatted again in the browser. (Polls
// writes the days and times of its polls on the Chest's clock, by
// src/lib/dates.ts.)
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: Locale, timeZone: string, currency = "EUR") {
  const tag = intl(locale);
  const instant = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
  return {
    locale,
    timeZone,
    // An instant (a timestamptz): in the reader's zone.
    date: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", year: "numeric" }).format(instant(value)),
    time: (value: Date | string) => dateFormat(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    dateTime: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    // A calendar day ("2026-10-05", a date column): the same day everywhere.
    day: (iso: string) => dateFormat(tag, "UTC", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`)),
    // A number, with at most `digits` decimals (an average: 3.7).
    number: (n: number, digits = 1) => numberFormat(tag, { maximumFractionDigits: digits }).format(n),
    money: (amount: number) => numberFormat(tag, { style: "currency", currency }).format(amount),
    // "Sales, Tech and Léa Dubois".
    list: (items: string[]) => listFormat(tag).format(items),
    // The form of n in this language (French says "0 note", English "0 notes").
    plural: (forms: Plural, n: number, values: Record<string, string | number> = {}) => plural(forms, n, locale, values),
  };
}
