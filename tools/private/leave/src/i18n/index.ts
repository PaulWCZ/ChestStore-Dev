import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string; its
// `kit` section is the UI kit's words (KitWords: the toasts, dialogs, date
// fields, people picker, file picker, tables and filters).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// A language tag ("fr", "de", null) narrowed to one the tool speaks;
// English otherwise. words(): its catalogue (createApp's words).
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);
export const words = (language: string): Catalogue => catalogue(localeOf(language));

export { compare, dateTag, format, formatDate, formatDay, formatDays, formatNumber, plural, relative, spanText } from "./format.ts";
