// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Intl objects are costly and live
// outside V8's heap — one made per call (per row of a page) piles up
// hundreds of MiB before a collection frees it — so each is made once per
// language, zone and style, and kept (here, on the server and in the
// browser alike).
type Locale = string;

const made = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.ListFormat>();
function once<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.ListFormat>(key: string, make: () => T): T {
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
export const listFormat = (locale: Locale, type: "conjunction" | "disjunction" = "conjunction"): Intl.ListFormat =>
  once(`l|${locale}|${type}`, () => new Intl.ListFormat(intl(locale), { type }));
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

// A date in the reader's language, in the zone given: the reader's
// (member.timeZone) for an instant, "UTC" for a calendar day kept as
// "YYYY-MM-DD" (read at noon UTC, so no zone moves it).
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  return dateFormat(locale, options).format(typeof value === "string" ? new Date(value) : value);
}

// A calendar day ("2026-10-05") in a few words, the same in every zone.
export const dayText = (day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string =>
  formatDate(day + "T12:00:00Z", locale, { ...options, timeZone: "UTC" });

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
