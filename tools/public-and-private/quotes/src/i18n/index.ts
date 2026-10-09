import { localeIn } from "@argentic/chest-app";
import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
// Server side only: islands import ./format.ts (no catalogue) and get their
// words as props.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string — its
// `kit` section is the UI kit's words (KitWords: the date words carry a
// date order and a first day of the week).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

export const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// The words of a language tag ("fr", "de"…): one the tool speaks, else
// English (@argentic/chest-app's createApp asks this).
export const words = (language: string): Catalogue => catalogues[localeIn(locales, language)];

// A member's or the Chest's language, narrowed to one the tool speaks.
export const localeOf = (language: string | null | undefined): Locale => localeIn(locales, language);

export { countryName, format, formatDate, formatDay, formatSize, intl, languageNames, numericDay, plural, relative } from "./format.ts";
