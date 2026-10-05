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

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : "en");

// A visitor's language on the public part: their choice (the cookie the
// switch sets), else the first of Accept-Language the tool speaks, else
// the Chest's own language, else English.
export function publicLocale(cookie: string | undefined, accept: string | undefined, chestLanguage?: string): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (accept ?? "").split(",").slice(0, 16).map((part, index) => {
    const [tag = "", q] = part.trim().split(";q=");
    return { language: tag.toLowerCase().split("-")[0] ?? "", weight: q === undefined ? 1 : Number(q) || 0, index };
  }).filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(chestLanguage);
}

// fill puts values in a text's {placeholders}.
export const fill = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page) piles up hundreds of MiB before a GC frees it. Each
// is made once per language, zone and style, and kept.
const made = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules>();
function once<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
const dates = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions) =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { timeZone, ...style }));
const numbers = (tag: string, style: Intl.NumberFormatOptions = {}) => once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));

// How a reader writes dates, times, numbers, amounts and plurals: their
// language, their time zone (a member's own; the Chest's for a visitor),
// the Chest's currency. Made on the server for each request: a page is
// sent already written, never formatted again in the browser.
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: Locale, timeZone: string, currency = "EUR") {
  // English as written in Europe (day month year, 24-hour clock).
  const tag = locale === "en" ? "en-GB" : locale;
  const instant = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
  return {
    locale,
    timeZone,
    // An instant (a timestamptz): in the reader's zone.
    date: (value: Date | string) => dates(tag, timeZone, { day: "numeric", month: "short", year: "numeric" }).format(instant(value)),
    time: (value: Date | string) => dates(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    dateTime: (value: Date | string) => dates(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    // A calendar day ("2026-10-05", a date column): the same day everywhere.
    day: (iso: string) => dates(tag, "UTC", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`)),
    number: (n: number) => numbers(tag).format(n),
    money: (amount: number) => numbers(tag, { style: "currency", currency }).format(amount),
    // The form of n in this language (French says "0 note", English "0 notes").
    plural: (forms: Plural, n: number, values: Record<string, string | number> = {}) =>
      fill(n === 0 && forms.zero !== undefined ? forms.zero : once(`p|${tag}`, () => new Intl.PluralRules(tag)).select(n) === "one" ? forms.one : forms.other, { count: numbers(tag).format(n), ...values }),
  };
}
