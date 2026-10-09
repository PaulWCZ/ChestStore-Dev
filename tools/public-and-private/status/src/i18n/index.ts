import type { DateWords, KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
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
// except the UI kit's words (kit, and the date words, which carry a date
// order and a first day of the week).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "date" | "kit">> & { readonly date: DateWords; readonly kit: KitWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// localeOf narrows any language ("de", "fr-CA", null) to one the tool
// speaks: English otherwise.
export const localeOf = (value: unknown): Locale => (isLocale(value) ? value : defaultLocale);

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}

// The reader's words, as @argentic/chest-app asks them (createApp's words).
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

// publicLocale is the language of a page of the public part, where there is
// no member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise the Chest's
// own language, otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined, chestLanguage?: string | null): Locale {
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
    .filter(r => r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(chestLanguage);
}

export { clock, day, duration, format, intl, moment, month, percent, plural, relative, stamp, zoneAbbreviation, zoneName } from "../components/format.ts";
