import type { DateWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's date words, which carry a date order and a first
// day of the week (the kit's DateWords type).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "date">> & { readonly date: DateWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);
export const catalogue = (locale: Locale): Catalogue => catalogues[locale] ?? catalogues[defaultLocale];
// The same, by the name the starter's machinery (src/core/) uses.
export const words = catalogue;

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// publicLocale is the language of a page outside /chest, where there is no
// member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise the Chest's
// own language, otherwise English.
export function publicLocale(cookie: string | undefined, accept: string | null | undefined, chestLanguage?: string): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (accept ?? "").split(",").slice(0, 32).map((part, index) => {
    const [tag = "", ...params] = part.split(";").map(p => p.trim());
    const q = params.find(p => p.startsWith("q="));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
  }).filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(chestLanguage);
}

// format fills the {placeholders} of a text (fill: the starter's name).
export const format = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
export const fill = format;

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export const intl = (locale: string): string => (locale === "en" ? "en-GB" : locale);

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page) piles up memory before a GC frees it. Each is made
// once per language, zone and style, and kept.
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
const listFormat = (tag: string, type: "conjunction" | "disjunction") => once(`l|${tag}|${type}`, () => new Intl.ListFormat(tag, { type }));

// plural picks the form of a { zero?, one, other } entry for n in that
// language, then fills {count} (written in the language) and the values.
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(tag).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(tag).format(n), ...values });
}

// A date in the reader's language, in the zone given (the Chest's for the
// company's clock, "UTC" for a day kept as "YYYY-MM-DD"). Always given: a
// server's own zone is nobody's.
export function formatDate(value: Date | string, locale: string, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  const { timeZone, ...style } = options;
  return dateFormat(intl(locale), timeZone, style).format(typeof value === "string" ? new Date(value) : value);
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

// orList writes "Sofia Rossi, Camille Martin or another publisher" in that
// language.
export const orList = (items: string[], locale: string): string => listFormat(intl(locale), "disjunction").format(items);

// How a reader writes dates, times, numbers and plurals (the starter's
// formatter, given to every page as `f`): their language, their own time
// zone. News writes the days and times of its posts on the Chest's clock,
// by src/lib/dates.ts; `f` is the starter's, kept for what is the reader's.
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: Locale, timeZone: string, currency = "EUR") {
  const tag = intl(locale);
  const instant = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
  return {
    locale,
    timeZone,
    date: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", year: "numeric" }).format(instant(value)),
    time: (value: Date | string) => dateFormat(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    dateTime: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    day: (iso: string) => dateFormat(tag, "UTC", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`)),
    number: (n: number, digits = 1) => numberFormat(tag, { maximumFractionDigits: digits }).format(n),
    money: (amount: number) => numberFormat(tag, { style: "currency", currency }).format(amount),
    list: (items: string[]) => listFormat(tag, "conjunction").format(items),
    plural: (forms: Plural, n: number, values: Record<string, string | number> = {}) => plural(forms, n, locale, values),
  };
}
