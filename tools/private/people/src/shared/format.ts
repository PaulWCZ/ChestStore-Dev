// Formatting helpers, free of the catalogues (an island may import them
// without shipping every language's words; pages are written on the
// server with them). Intl objects are costly and live outside V8's heap —
// one made per call (per row of a page) piles up hundreds of MiB before a
// collection frees it — so each is made once per language, zone and style,
// and kept. Nothing else in the tool creates an Intl object
// (test/literals.test.ts refuses `new Intl.` outside this file).
type Locale = string;

type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.Collator;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// The kept Intl objects, by language and options.
export const dateFormat = (locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(intl(locale), options));
export const numberFormat = (locale: Locale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(intl(locale), options));
// Names in the reader's alphabetical order (accents and case aside).
export const collator = (locale: Locale, options: Intl.CollatorOptions = { sensitivity: "base" }): Intl.Collator =>
  once(`c|${locale}|${JSON.stringify(options)}`, () => new Intl.Collator(intl(locale), options));
const pluralRules = (locale: Locale) => once(`p|${locale}`, () => new Intl.PluralRules(intl(locale)));
const relativeFormat = (locale: Locale) => once(`r|${locale}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(locale).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(locale).format(n), ...values });
}

// An instant in the reader's language and zone (member(request).timeZone:
// "store in UTC, show in the member's").
export function formatDate(value: Date | string, locale: Locale, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(locale, { timeZone, ...options }).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = relativeFormat(locale);
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// Each language named in itself, never translated (a switch, a picker).
export const languageNames: Record<string, string> = { en: "English", fr: "Français" };

// formatDay writes a calendar day (YYYY-MM-DD, or MM-DD for a birthday) in
// that language, whatever the server's time zone.
export function formatDay(value: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  const iso = /^\d{2}-\d{2}$/u.test(value) ? "2000-" + value : value;
  const f = dateFormat(locale, { timeZone: "UTC", ...options });
  const date = new Date(iso + "T00:00:00Z");
  // French writes the first of a month "1er juin", never "1 juin".
  if (!locale.startsWith("fr") || iso.slice(8, 10) !== "01" || (options.month !== "long" && options.month !== "short") || options.day === undefined) return f.format(date);
  return f.formatToParts(date).map(p => (p.type === "day" ? p.value + "er" : p.value)).join("");
}

// relativeDays says "today", "yesterday", "6 days ago", "in 2 weeks"… for a
// number of days from today (negative: past).
export function relativeDays(days: number, locale: Locale): string {
  const rtf = relativeFormat(locale);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  if (Math.abs(days) < 31) return rtf.format(Math.round(days / 7), "week");
  return rtf.format(Math.round(days / 30.44), "month");
}

// The months of the year in that language, for a picker.
export function monthNames(locale: Locale): string[] {
  const f = dateFormat(locale, { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2000, i, 1))));
}

// The days of the week in that language, Sunday first (a weekend warning).
export function weekdayNames(locale: Locale): string[] {
  return Array.from({ length: 7 }, (_, i) => formatDay(`2024-01-${String(7 + i).padStart(2, "0")}`, locale, { weekday: "long" }));
}
