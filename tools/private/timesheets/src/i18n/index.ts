import type { KitWords } from "@argentic/chest-ui/components/logic";
import { localeIn, publicLocale as visitorLocale } from "@argentic/chest-app";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// Each language named in itself, never translated (the root's switch).
export const languageNames: Record<Locale, string> = { en: "English", fr: "Français" };

// A catalogue has the shape of the English one, every leaf a string; its
// `kit` section is the UI kit's words (KitWords: toasts, dialogs, dates,
// files, tables, search…), typed by the kit.
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
export const localeOf = (language: string | null | undefined): Locale => localeIn(locales, language);
export const words = (language: string): Catalogue => catalogue(localeOf(language));

// publicLocale is the language of a page outside /chest, where there is no
// member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  return visitorLocale(locales, cookie, acceptLanguage ?? undefined);
}

export { clock, compare, decimal, format, formatDate, formatDay, intl, money, percent, plural, relative } from "./format.ts";
