import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string (the
// kit's date words keep their order code and first day of the week).
type Shape<T> = {
  readonly [K in keyof T]: T[K] extends "dmy" | "mdy" | "ymd" ? "dmy" | "mdy" | "ymd" : T[K] extends string ? string : T[K] extends 0 | 1 ? 0 | 1 : Shape<T[K]>;
};
export type Catalogue = Shape<typeof en>;

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// publicLocale is the language of a page of the public part, where there is
// no member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  if (!acceptLanguage) return defaultLocale;
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
  return ranked.map(r => r.language).find(isLocale) ?? defaultLocale;
}

export { format, formatDate, intl, plural, relative, timeZone } from "./format.ts";
