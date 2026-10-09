import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";
import { dateFormat, format, intl, listFormat, numberFormat, plural } from "./format.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string; its
// `kit` section is the UI kit's words (KitWords).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function catalogue(locale: Locale): Catalogue {
  return catalogues[locale] ?? catalogues[defaultLocale];
}
// The same, by the name the starter's machinery uses (src/core/).
export const words = catalogue;

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// publicLocale is the language of a page of the public part, where there is
// no member: the visitor's choice (a cookie set by the switch), otherwise the
// first language of Accept-Language the tool speaks, otherwise the Chest's
// own language (chest.language, when the tool speaks it), otherwise English.
export function publicLocale(cookie: string | undefined, acceptLanguage: string | null | undefined, fallback?: string): Locale {
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
  return ranked.map(r => r.language).find(isLocale) ?? localeOf(fallback);
}

// fill puts values in a text's {placeholders} (the starter's name of format).
export const fill = format;

// How a reader writes dates, times, numbers, amounts and plurals: their
// language, their time zone (a member's own; the Chest's for a visitor),
// the Chest's currency. Made on the server for each request: a page is
// sent already written. (Booking writes a meeting in the zone it belongs
// to — the host's, the guest's — with the helpers of ./format.ts.)
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: Locale, timeZone: string, currency = "EUR") {
  const tag = intl(locale);
  const instant = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);
  return {
    locale,
    timeZone,
    date: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", year: "numeric" }).format(instant(value)),
    time: (value: Date | string) => dateFormat(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    dateTime: (value: Date | string) => dateFormat(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(instant(value)),
    day: (iso: string) => dateFormat(tag, "UTC", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`)),
    number: (n: number, digits = 1) => numberFormat(tag, { maximumFractionDigits: digits }).format(n),
    money: (amount: number) => numberFormat(tag, { style: "currency", currency }).format(amount),
    list: (items: string[]) => listFormat(locale).format(items),
    plural: (forms: { readonly zero?: string; readonly one: string; readonly other: string }, n: number, values: Record<string, string | number> = {}) => plural(forms, n, locale, values),
  };
}

export { clock, dayWords, endClock, firstUpper, format, intl, languageNames, listFormat, meetingTime, plural, relative, startsWithVowel, zoneName } from "./format.ts";
