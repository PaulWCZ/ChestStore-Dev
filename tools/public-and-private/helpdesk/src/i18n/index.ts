import { localeIn } from "@argentic/chest-app";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string — but
// the kit's words (their own types: a date's parts, plurals).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: typeof en.kit };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// The words of a language tag (the package's words(locale)): the tool's
// language when it speaks it, else English.
export const words = (locale: string): Catalogue => catalogues[localeIn(locales, locale)];
export const localeOf = (locale: string): Locale => localeIn(locales, locale);

// publicLocale is the language of a page of the public part, where there is
// no member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise the Chest's
// own language (chest.language, when the tool speaks it), otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined, fallback: Locale = defaultLocale): Locale {
  if (isLocale(cookie)) return cookie;
  if (!acceptLanguage) return fallback;
  const ranked = acceptLanguage
    .split(",")
    .slice(0, 32)
    .map((part, index) => {
      const [tag = "", ...params] = part.split(";").map(p => p.trim());
      const q = params.find(p => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(r => r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? fallback;
}

export { fileSize, format, formatDate, intl, languageIn, languageNames, number, plural, relative } from "../lib/format.ts";
