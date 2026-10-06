// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
type Locale = string;

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page, per day of a month grid) piles up hundreds of MiB on
// the server before a GC frees it. Each is made once per language, zone
// and style, and kept (in the server's process and in the browser alike).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.Collator;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
const dates = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { ...style, timeZone }));
const numbers = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));

// compare sorts names as the reader's language does ("Élodie" with the
// E's): compare(locale)(a, b), for Array.sort.
export const compare = (locale: Locale): ((a: string, b: string) => number) => once(`c|${locale}`, () => new Intl.Collator(locale)).compare;

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : once(`p|${locale}`, () => new Intl.PluralRules(locale)).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numbers(locale).format(n), ...values });
}

// An instant in the reader's language and zone (member(request).timeZone:
// "store in UTC, show in the member's").
export function formatDate(value: Date | string, locale: Locale, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dates(dateTag(locale), timeZone, options).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = once(`r|${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// English dates are written day first ("Mon 5 Oct"), as the tool's first
// readers — companies in France — write them.
export const dateTag = (locale: Locale): string => (locale === "en" ? "en-GB" : locale);

// A calendar day ("2026-10-05") in the reader's language: days are dates,
// not instants, so they are written in UTC, where they were made.
// French writes the first of a month "1er juin", never "1 juin".
// thisYear ("2026"): the year is written when the day is in another one
// (a short date never hides that it is next year's).
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }, thisYear?: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const shape = thisYear !== undefined && day.slice(0, 4) !== thisYear && options.month !== undefined && options.year === undefined ? { ...options, year: "numeric" as const } : options;
  const f = dates(dateTag(locale), "UTC", shape);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  if (d !== 1 || !locale.startsWith("fr") || (shape.month !== "long" && shape.month !== "short") || shape.day === undefined) return f.format(date);
  return f.formatToParts(date).map(p => (p.type === "day" ? p.value + "er" : p.value)).join("");
}

// A number as the reader writes numbers: "2.5", "2,5", "12" (grouping:
// false for a file a program reads again).
export function formatNumber(n: number, locale: Locale, options: { grouping?: boolean } = {}): string {
  return numbers(locale, { maximumFractionDigits: 2, ...(options.grouping === false ? { useGrouping: false } : {}) }).format(n);
}

// A number of days as the reader writes numbers: "2.5", "2,5", "12".
export function formatDays(n: number, locale: Locale): string {
  return formatNumber(n, locale);
}

// A leave's dates in words: "Mon 5 Oct", "Mon 5 Oct, morning",
// "Mon 5 – Fri 9 Oct", "Mon 5 Oct (afternoon) – Fri 9 Oct (morning)".
// year: always written; thisYear ("2026"): written, on both days, when
// either is in another year (leave over New Year, next summer's leave).
export type SpanWords = { readonly morning: string; readonly afternoon: string; readonly from: string; readonly to: string };
export function spanText(span: { start: string; startHalf: "am" | "pm"; end: string; endHalf: "am" | "pm" }, locale: Locale, words: SpanWords, options: { year?: boolean; thisYear?: string } = {}): string {
  const year = options.year === true || (options.thisYear !== undefined && (span.start.slice(0, 4) !== options.thisYear || span.end.slice(0, 4) !== options.thisYear));
  const shape: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) };
  if (span.start === span.end) {
    const one = formatDay(span.start, locale, shape);
    if (span.startHalf === "am" && span.endHalf === "pm") return one;
    return format(span.startHalf === "am" ? words.morning : words.afternoon, { day: one });
  }
  const first = span.startHalf === "pm" ? format(words.from, { day: formatDay(span.start, locale, shape) }) : formatDay(span.start, locale, shape);
  const last = span.endHalf === "am" ? format(words.to, { day: formatDay(span.end, locale, shape) }) : formatDay(span.end, locale, shape);
  return `${first} – ${last}`;
}
