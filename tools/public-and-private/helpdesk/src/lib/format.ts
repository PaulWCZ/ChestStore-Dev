import { dateFormat, fill, numberFormat, type Plural } from "@argentic/chest-app";

// Writing for a reader, on the server: dates in their language and time
// zone, "3 minutes ago", file sizes, plurals. Every Intl object is made
// once per language, zone and style and kept (the package's dateFormat and
// numberFormat; PluralRules, RelativeTimeFormat and DisplayNames here): one made per row
// piles up memory outside V8's heap. A page is sent already written;
// islands never format a date.

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export const intl = (locale: string): string => (locale === "en" ? "en-GB" : locale);

// format fills the {placeholders} of a text.
export const format = fill;

// plural picks the form of a { zero?, one, other } entry for n in that
// language, then fills {count}.
const rules = new Map<string, Intl.PluralRules>();
export function plural(forms: Plural, n: number, locale: string, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  let rule = rules.get(tag);
  if (!rule) rules.set(tag, (rule = new Intl.PluralRules(tag)));
  const form = n === 0 && forms.zero !== undefined ? forms.zero : rule.select(n) === "one" ? forms.one : forms.other;
  return fill(form, { count: numberFormat(tag).format(n), ...values });
}

// A moment in the reader's language and time zone (a member's own; the
// Chest's for a visitor).
export function formatDate(value: Date | string, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(intl(locale), timeZone, options).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
const relatives = new Map<string, Intl.RelativeTimeFormat>();
export function relative(value: Date | string, locale: string, now = new Date()): string {
  const tag = intl(locale);
  let rtf = relatives.get(tag);
  if (!rtf) relatives.set(tag, (rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" })));
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// A whole number in the reader's language ("1 500" in French).
export const number = (n: number, locale: string): string => numberFormat(intl(locale)).format(n);

// Each language named in itself, never translated (a switch, a picker).
export const languageNames: Record<string, string> = { en: "English", fr: "Français" };

// A language's name in the reader's language ("French", « anglais »).
const displayNames = new Map<string, Intl.DisplayNames>();
export function languageIn(code: string, locale: string): string {
  let names = displayNames.get(locale);
  if (!names) displayNames.set(locale, (names = new Intl.DisplayNames([locale], { type: "language" })));
  return names.of(code) ?? languageNames[code] ?? code;
}

// fileSize says "340 KB", "2.4 MB" in that language.
export function fileSize(bytes: number, locale: string): string {
  const [unit, value] = bytes < 1024 * 1024 ? ["kilobyte", Math.max(1, Math.round(bytes / 1024))] as const : ["megabyte", Math.round((bytes / (1024 * 1024)) * 10) / 10] as const;
  return numberFormat(intl(locale), { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(value);
}
