import { dateFormat, fill, numberFormat, type Plural } from "@argentic/chest-app";
import type { KitWords } from "@argentic/chest-ui/components/logic";
import { en } from "./en.ts";
import { fr } from "./fr.ts";

// The languages of the tool: English first (the source, the default and the
// fallback), French second. Adding a language is one catalogue file of the
// same shape and its code here — nothing else in the code names a language.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

// A catalogue has the shape of the English one, every leaf a string —
// except the UI kit's words (the kit's KitWords: a date order, file
// units…).
type Shape<T> = { readonly [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Catalogue = Shape<Omit<typeof en, "kit">> & { readonly kit: KitWords };

const catalogues: Record<Locale, Catalogue> = { en, fr };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (locales as readonly string[]).includes(value);
export const catalogue = (locale: Locale): Catalogue => catalogues[locale] ?? catalogues[defaultLocale];
// What createApp() reads (src/app.tsx): the words of a language it serves.
export const words = (locale: string): Catalogue => catalogue(localeOf(locale));

// A member's language (member.language: "fr", "de"…), narrowed to one the
// tool speaks; English otherwise.
export const localeOf = (language: string | null | undefined): Locale => (isLocale(language) ? language : defaultLocale);

// The words of the "New page" dialog: the built-in templates' names only
// (their text stays on the server).
export function newPageWords(t: Catalogue) {
  const b = t.templates.builtin;
  return {
    newPage: t.newPage,
    common: t.common,
    dialog: t.kit.dialog,
    templates: { start: t.templates.start, blank: t.templates.blank, builtin: { meeting: b.meeting.name, howto: b.howto.name, decision: b.decision.name } },
  };
}
export type NewPageWords = ReturnType<typeof newPageWords>;

// format fills the {placeholders} of a text (the package's fill).
export const format = fill;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export const intl = (locale: string): string => (locale === "en" ? "en-GB" : locale);

// Every Intl object is made once per language (and zone, and style) and
// kept: one made per row piles up outside V8's heap. The package keeps
// DateTimeFormat and NumberFormat (dateFormat, numberFormat); the others
// are kept here.
const pluralRules = new Map<string, Intl.PluralRules>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
const listFormats = new Map<string, Intl.ListFormat>();
function kept<T>(map: Map<string, T>, tag: string, make: () => T): T {
  let found = map.get(tag);
  if (!found) map.set(tag, (found = make()));
  return found;
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language, then fills {count} written in it.
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  const rules = kept(pluralRules, tag, () => new Intl.PluralRules(tag));
  const form = n === 0 && forms.zero !== undefined ? forms.zero : rules.select(n) === "one" ? forms.one : forms.other;
  return fill(form, { count: numberFormat(tag).format(n), ...values });
}

// A date in the reader's language, in the zone given: the reader's own
// (member.timeZone) for what happened, the Chest's for a company's day.
// Always given: a server's zone is nobody's.
export function formatDate(value: Date | string, locale: string, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  const { timeZone, ...style } = options;
  return dateFormat(intl(locale), timeZone, style).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: string, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const tag = intl(locale);
  const rtf = kept(relativeFormats, tag, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// moment says when something happened today ("10:02"), or which day and
// when ("12 Oct, 10:02"), in the reader's zone (member.timeZone).
export function moment(value: Date | string, locale: string, timeZone: string, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = dateFormat("en-CA", timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  const tag = intl(locale);
  if (day.format(date) === day.format(now)) return dateFormat(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(date);
  return dateFormat(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

// orList writes "Camille Martin, Tom Walker or Inès Moreau" in that
// language.
export function orList(items: string[], locale: string): string {
  const tag = intl(locale);
  return kept(listFormats, tag, () => new Intl.ListFormat(tag, { type: "disjunction" })).format(items);
}
