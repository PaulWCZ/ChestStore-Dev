// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// Intl objects are costly and live outside V8's heap: one made per call
// (per desk of a plan, per quarter hour of the rooms' grid) piles up
// hundreds of MiB on the server before a GC frees it. Each is made once per
// language, zone and style, and kept — in the server's process and in the
// browser alike. Nowhere else in Rooms is an Intl object made
// (test/units.test.ts holds it).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
// A date format of a language tag ("en-GB", "fr") in a zone, made once.
export const dateFormat = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { ...style, timeZone }));
export const numberFormat = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));
const pluralRules = (tag: string) => once(`p|${tag}`, () => new Intl.PluralRules(tag));

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

// A number in the reader's language ("1.5", "1,5").
export function formatNumber(n: number, locale: Locale): string {
  return numberFormat(intl(locale)).format(n);
}

// The year a reader is in (a day written in another year says its year).
// The server and the browser each know theirs; a day a few hours either
// side of New Year is the only one that may read differently.
const yearNow = (): string => String(new Date().getUTCFullYear());

// An instant in the reader's language, in a time zone (the Chest's, which
// the server gives: lib/zone.ts).
export function formatDate(value: Date | string, locale: Locale, zone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(intl(locale), zone, options).format(typeof value === "string" ? new Date(value) : value);
}

// A day (YYYY-MM-DD) in words: "Tue 30 Sept", "mar. 30 sept." — and
// "Tue 5 Jan 2027" when the day is not in this year (a day with a month
// says its year then; a weekday alone never does). A day has no time zone:
// it is written as the calendar says it.
export function formatDay(d: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }, thisYear: string = yearNow()): string {
  const withYear = options.month !== undefined && options.year === undefined && d.slice(0, 4) !== thisYear ? { ...options, year: "numeric" as const } : options;
  return dateFormat(intl(locale), "UTC", withYear).format(new Date(d + "T00:00:00Z"));
}

// A time of day from minutes after midnight, in that language's clock.
export function formatTime(minutes: number, locale: Locale): string {
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
  const text = dateFormat(intl(locale), "UTC", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return minutes === 1440 ? text.replace(/^0?0/u, "24") : text;
}

// "10:00–11:30".
export function formatSpan(start: number, end: number, locale: Locale): string {
  return formatTime(start, locale) + "–" + formatTime(end, locale);
}
