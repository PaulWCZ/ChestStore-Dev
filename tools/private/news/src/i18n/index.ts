import { dateFormat, fill, numberFormat, type Plural } from "@argentic/chest-app";
import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's words (the kit's KitWords: a date order, a first
// day of the week…).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);
export const catalogue = (locale: Locale): Catalogue => catalogues[locale] ?? catalogues[defaultLocale];
// What createApp() reads (src/app.tsx): the words of a language it serves.
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// format fills the {placeholders} of a text (the package's fill).
export const format = fill;

// plural picks the form of a { zero?, one, other } entry for n in that
// language, then fills {count} written in it (the package's plural is the
// browser's; this one keeps its PluralRules, one per language).
const pluralRules = new Map<string, Intl.PluralRules>();
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  let rules = pluralRules.get(tag);
  if (!rules) pluralRules.set(tag, (rules = new Intl.PluralRules(tag)));
  const form = n === 0 && forms.zero !== undefined ? forms.zero : rules.select(n) === "one" ? forms.one : forms.other;
  return fill(form, { count: numberFormat(tag).format(n), ...values });
}

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export const intl = (locale: string): string => (locale === "en" ? "en-GB" : locale);

// A date in the reader's language, in the zone given (the Chest's for the
// company's clock, "UTC" for a day kept as "YYYY-MM-DD"). Always given: a
// server's own zone is nobody's. The Intl object is made once (the
// package's dateFormat keeps it).
export function formatDate(value: Date | string, locale: string, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  const { timeZone, ...style } = options;
  return dateFormat(intl(locale), timeZone, style).format(typeof value === "string" ? new Date(value) : value);
}

// The Intl objects the package does not keep: made once per language.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: string, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const tag = intl(locale);
  let rtf = relativeFormats.get(tag);
  if (!rtf) relativeFormats.set(tag, (rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" })));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// orList writes "Sofia Rossi, Camille Martin or another publisher",
// andList "Sales, Tech and 2 people", in that language.
function listIn(locale: string, type: "conjunction" | "disjunction"): Intl.ListFormat {
  const tag = intl(locale);
  let list = listFormats.get(`${tag}|${type}`);
  if (!list) listFormats.set(`${tag}|${type}`, (list = new Intl.ListFormat(tag, { type })));
  return list;
}
export const orList = (items: string[], locale: string): string => listIn(locale, "disjunction").format(items);
export const andList = (items: string[], locale: string): string => listIn(locale, "conjunction").format(items);
