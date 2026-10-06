// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Intl objects are costly and live
// outside V8's heap — one made per call (per row of a page) piles up
// hundreds of MiB before a collection frees it — so each is made once per
// language, zone and style, and kept (here, on the server and in the
// browser alike). Nothing else in the tool says `new Intl.…`
// (test/literals.test.ts).
type Locale = string;
type Kept = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.DisplayNames | Intl.Collator;

const made = new Map<string, Kept>();
function once<T extends Kept>(key: string, make: () => T): T {
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
// The same, for a locale tag given as it is ("en-CA": a day as YYYY-MM-DD).
export const rawDateFormat = (tag: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`D|${tag}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(tag, options));
export const numberFormat = (locale: Locale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(intl(locale), options));
export const regionNames = (locale: Locale): Intl.DisplayNames =>
  once(`r|${locale}`, () => new Intl.DisplayNames([intl(locale)], { type: "region" }));
export const collator = (locale: Locale): Intl.Collator =>
  once(`c|${locale}`, () => new Intl.Collator(intl(locale)));
const pluralRules = (locale: Locale) => once(`p|${locale}`, () => new Intl.PluralRules(intl(locale)));
const relativeFormat = (locale: Locale) => once(`t|${locale}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));

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

// An instant in the reader's language and in a zone the caller names: the
// reader's (member.timeZone) for what is shown to them, the Chest's
// (lib/zone.ts) for what is the company's.
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  const shape: Intl.DateTimeFormatOptions = Object.keys(options).some(k => k !== "timeZone") ? {} : { day: "numeric", month: "short", year: "numeric" };
  return dateFormat(locale, { ...shape, ...options }).format(typeof value === "string" ? new Date(value) : value);
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

// money writes an amount of whole cents in the reader's conventions
// ("€12,500" in English, "12 500 €" in French) and in a currency (the
// deal's; the company's, chest.currency, for totals); whole units unless
// cents are asked for, or "€12.5K" / "12,5 k€" when compact.
export function money(cents: number, locale: Locale, options: { cents?: boolean; compact?: boolean; currency?: string } = {}): string {
  return numberFormat(locale, {
    style: "currency",
    currency: options.currency ?? "EUR",
    ...(options.compact ? { notation: "compact", maximumFractionDigits: 1 } : { minimumFractionDigits: options.cents ? 2 : 0, maximumFractionDigits: options.cents ? 2 : 0 }),
  }).format(cents / 100);
}

// formatDay writes a day (YYYY-MM-DD) as it is, whatever the time zone.
// With thisYear ("2026"), a day of another year says its year (unless the
// options already say whether to show one).
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }, thisYear?: string): string {
  const shape = thisYear !== undefined && options.year === undefined && options.month !== undefined && day.slice(0, 4) !== thisYear ? { ...options, year: "numeric" as const } : options;
  return dateFormat(locale, { ...shape, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}
