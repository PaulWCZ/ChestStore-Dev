import { localeIn } from "@argentic/chest-app";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The tool's languages: English first (the source, the default and the
// fallback), French second. A new language is one file of the same shape
// and its code here; nothing else names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
// Each named in itself (the public part's switch).
export const languageNames: Record<Locale, string> = { en: "English", fr: "Français" };

type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: typeof en.kit };
export const catalogues: Record<Locale, Catalogue> = { en, fr };
export const words = (locale: string): Catalogue => catalogues[localeIn(locales, locale)];

export { fill, type Format } from "@argentic/chest-app";
