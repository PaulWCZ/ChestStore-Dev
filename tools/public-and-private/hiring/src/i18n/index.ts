import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string — but
// the kit's words (their own types: a date's parts, plurals, the first
// day of the week).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: typeof en.kit };

const catalogues: Record<Locale, Catalogue> = { en, fr };
// Every catalogue, by language (the tests read them all).
export const all: Readonly<Record<Locale, Catalogue>> = catalogues;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// The tool's language for a language tag: itself when the tool speaks it,
// else English.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// The package's words(locale): the catalogue of a language tag.
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

export { fileSize, format, formatDate, intl, languageNames, money, plural, relative } from "../shared/format.ts";
