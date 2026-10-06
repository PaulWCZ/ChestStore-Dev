// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
//
// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page, per line of a PDF) piles up hundreds of MiB on the
// server before a GC frees it. Every Intl object of the tool is made here,
// once per language, zone and style, and kept (in the server's process and
// in the browser alike); test/units.test.ts refuses `new Intl.` anywhere
// else.
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.DisplayNames | Intl.Collator;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}

// A date format of a language tag ("en-GB", "fr") in its options' zone.
export const dateFormat = (tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(tag, options));
export const numberFormat = (tag: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${tag}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(tag, options));
export const pluralRules = (tag: string): Intl.PluralRules => once(`p|${tag}`, () => new Intl.PluralRules(tag));
const relativeFormat = (tag: string) => once(`r|${tag}`, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
// Words compared as people mean them: no case, no accents.
export const looseCollator = (): Intl.Collator => once("c|base", () => new Intl.Collator(undefined, { sensitivity: "base" }));

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(intl(locale)).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(intl(locale)).format(n), ...values });
}

// Dates in the reader's language. An instant is written in the zone given
// (a member's own, or the Chest's: chest.timeZone, given by the server,
// never guessed here); a day ("2026-09-28") is a calendar day, written as
// it is, whatever the zone.
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  return dateFormat(intl(locale), options).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(intl(locale), { ...options, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}

// A day as French paperwork writes it: 28/09/2026 (and 28/09/2026 in
// English too: the documents are European).
export function numericDay(day: string): string {
  return day.split("-").reverse().join("/");
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = relativeFormat(intl(locale));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// A country's name in a language ("BE" → "Belgique"). fallback "code":
// the code itself when the language does not know it; "none": "".
export function countryName(code: string, locale: Locale, fallback: "code" | "none" = "code"): string {
  try {
    const names = once(`r|${locale}|${fallback}`, () => new Intl.DisplayNames([locale], { type: "region", fallback }));
    return names.of(code) ?? (fallback === "code" ? code : "");
  } catch {
    return fallback === "code" ? code : "";
  }
}

// A size in kilobytes or megabytes, in the reader's language ("1,2 Mo").
export function formatSize(bytes: number, locale: Locale): string {
  const mega = bytes >= 1048576;
  return numberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "unit", unit: mega ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(mega ? bytes / 1048576 : Math.max(1, bytes / 1024));
}

// Each language named in itself, never translated (a switch, a picker).
export const languageNames: Record<string, string> = { en: "English", fr: "Français" };
