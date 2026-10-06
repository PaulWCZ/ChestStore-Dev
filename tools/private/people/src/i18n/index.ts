import type { KitWords } from "@argentic/chest-ui/components/logic";
import { localeIn } from "@argentic/chest-app";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string.
// (The kit's date words hold a day order, a week start and lists of names.)
type Shape<T> = {
  readonly [K in keyof T]: T[K] extends "dmy" | "mdy" | "ymd" ? "dmy" | "mdy" | "ymd" : T[K] extends string ? string : T[K] extends 0 | 1 ? 0 | 1 : Shape<T[K]>;
};
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

export const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// The words of a language the package names (any code: the tool's, else
// English).
export const words = (locale: string): Catalogue => catalogues[localeIn(locales, locale)];

// A member's language (member.language), narrowed to one the tool speaks.
export const localeOf = (language: string | null | undefined): Locale => localeIn(locales, language);

export { format, formatDate, formatDay, intl, languageNames, monthNames, plural, relative, relativeDays, weekdayNames } from "../shared/format.ts";
