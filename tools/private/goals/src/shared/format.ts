// Formatting, free of the catalogues and of the server: islands import it
// without shipping every language's words. Intl objects are costly and
// live outside V8's heap — one made per call (per row of a page) piles up
// hundreds of MiB before a collection frees it — so each is made once per
// language, zone and style, and kept (on the server and in the browser
// alike). Nothing else in Goals makes one (test/format.test.ts).
type Locale = string;

type Kept = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.ListFormat;
const made = new Map<string, Kept>();
function once<T extends Kept>(key: string, make: () => T): T {
  let found = made.get(key) as T | undefined;
  if (!found) {
    // A bound, in case a page asks for many zones or currencies: what
    // was kept is made again when asked.
    if (made.size >= 500) made.clear();
    made.set(key, (found = make()));
  }
  return found;
}

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// The kept Intl objects, by language and options (the options' order is
// part of the key: callers pass literals).
export const dateFormat = (locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(intl(locale), options));
export const numberFormat = (locale: Locale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(intl(locale), options));
export const pluralRules = (locale: Locale): Intl.PluralRules => once(`p|${locale}`, () => new Intl.PluralRules(intl(locale)));
export const listFormat = (locale: Locale, type: "conjunction" | "disjunction" = "conjunction"): Intl.ListFormat =>
  once(`l|${locale}|${type}`, () => new Intl.ListFormat(intl(locale), { type }));
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

// An instant in the reader's language, in a time zone the server gives
// (the Chest's: chest.timeZone) — never one written here.
export function formatDate(value: Date | string, locale: Locale, zone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(locale, { ...options, timeZone: zone }).format(typeof value === "string" ? new Date(value) : value);
}

// A day ("2026-10-12") in the reader's language: a date, not an instant,
// so no time zone moves it.
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
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
