import type { DateWords, KitWords } from "@argentic/chest-ui/components/logic";
import * as base from "./format.ts";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
// Each named in itself (the public page's switch).
export const languageNames: Record<Locale, string> = { en: "English", fr: "Français" };

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's date words, which carry a date order and a first day
// of the week (the kit's DateWords type), and the kit's own words.
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "date" | "kit">> & { readonly date: DateWords; readonly kit: KitWords };

export const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// The words of a language the package names (any code: the tool's, else
// English).
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

export { compareText, dayIn, format, intl, moneyText, plural, relative } from "./format.ts";

// Dates on the server, with the language's own way of writing the first of
// a month ("1er février"). An instant in the zone given (the reader's);
// a day ("YYYY-MM-DD") the same day everywhere.
export function formatDate(value: Date | string, locale: Locale, options?: Intl.DateTimeFormatOptions, zone?: string): string {
  return base.formatDate(value, locale, options, zone, catalogue(locale).dates.dayOne);
}
export function formatDay(value: string, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return base.formatDay(value, locale, options, catalogue(locale).dates.dayOne);
}
