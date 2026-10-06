import type { DateWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { dateFormat, format, numberFormat, plural } from "./format.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// Each language named in itself, never translated (the public part's
// language switch).
export const languageNames: Record<Locale, string> = { en: "English", fr: "Français" };

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's date words, which carry a date order and a first
// day of the week (the kit's DateWords type).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "date">> & { readonly date: DateWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}
// The starter's name for it.
export const words = catalogue;

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// publicLocale is the language of a page of the public part, where there is
// no member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise the Chest's
// own language, otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined, chestLanguage?: string): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .slice(0, 32)
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";").map(p => p.trim());
      const q = params.find(p => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(r => r.weight > 0 && r.language !== "")
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(chestLanguage);
}

// The starter's name for format().
export const fill = format;

// How a reader writes dates, times, numbers and plurals: their language,
// their time zone (a member's own; the Chest's for a visitor). Made on the
// server for each request from kept Intl objects (format.ts): a page is
// sent already written.
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: Locale, timeZone: string, currency = "EUR") {
  const instant = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
  return {
    locale,
    timeZone,
    // An instant (a timestamptz): in the reader's zone.
    date: (value: Date | string) => dateFormat(locale, { timeZone, day: "numeric", month: "short", year: "numeric" }).format(instant(value)),
    time: (value: Date | string) => dateFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    dateTime: (value: Date | string) => dateFormat(locale, { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    // A calendar day ("2026-10-05", a date column): the same day everywhere.
    day: (iso: string) => dateFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`)),
    number: (n: number) => numberFormat(locale).format(n),
    money: (amount: number) => numberFormat(locale, { style: "currency", currency }).format(amount),
    plural: (forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, values: Record<string, string | number> = {}) => plural(forms, n, locale, values),
  };
}

export { dateFormat, dayText, format, formatDate, intl, listFormat, numberFormat, plural, relative } from "./format.ts";
