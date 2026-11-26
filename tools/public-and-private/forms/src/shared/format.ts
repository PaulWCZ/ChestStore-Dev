// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a table, per answer of an export) piles up hundreds of MiB
// on the server before a GC frees it. Each is made once per language, zone
// and style, and kept — in the server's process and in the browser alike
// (test/sources.test.ts refuses `new Intl` anywhere else).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
export const dateFormat = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { ...style, timeZone }));
export const numberFormat = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat => once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));
const pluralRules = (tag: string) => once(`p|${tag}`, () => new Intl.PluralRules(tag));
const relativeFormat = (tag: string) => once(`r|${tag}`, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(tag).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(tag).format(n), ...values });
}

// A number in that language (1 234,5 in French), two decimals at most.
export const number = (n: number, locale: Locale): string => numberFormat(intl(locale), { maximumFractionDigits: 2 }).format(n);

// A size in kilobytes or megabytes, in that language.
export function size(bytes: number, locale: Locale): string {
  const mega = bytes > 1 << 20;
  return numberFormat(intl(locale), { style: "unit", unit: mega ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(mega ? bytes / (1 << 20) : Math.max(1, bytes / 1024));
}

// Dates in the reader's language, in a time zone: the Chest's (read on the
// server and passed down — this file is also the browser's, so it cannot
// read the Chest's settings itself).
export function formatDate(value: Date | string, locale: Locale, zone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(intl(locale), zone, options).format(typeof value === "string" ? new Date(value) : value);
}

// A moment as a list shows it: "6 Oct, 14:05" this year, "6 Oct 2025,
// 14:05" another year (the year is written when it is not this one).
export function when(value: Date | string, locale: Locale, zone: string, { time = true, long = false, now = new Date() }: { time?: boolean; long?: boolean; now?: Date } = {}): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = dateFormat("en", zone, { year: "numeric" });
  const same = year.format(date) === year.format(now);
  return dateFormat(intl(locale), zone, { ...(long ? { weekday: "long" } : {}), day: "numeric", month: long ? "long" : "short", ...(same ? {} : { year: "numeric" }), ...(time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) }).format(date);
}

// A calendar day ("2026-10-08") in words, the same in every zone.
export function dayWords(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(intl(locale), "UTC", options).format(new Date(day.slice(0, 10) + "T12:00:00Z"));
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
