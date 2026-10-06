import type { DateWords, DialogWords, FileWords, KitWords, TableWords, ToastWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's words, of the kit's own types (a date order, a first
// day of the week, the four units of a file's size…).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : T[K] extends readonly string[] ? readonly string[] : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "date" | "files" | "table" | "toast" | "dialog" | "kit">> & { readonly date: DateWords; readonly files: FileWords; readonly table: TableWords; readonly toast: ToastWords; readonly dialog: DialogWords; readonly kit: KitWords };

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

// What createApp() reads (src/app.tsx): the words of a language it serves.
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

export { dot, format, formatDate, intl, languageNames, plural, relative, shortDate } from "./format.ts";
