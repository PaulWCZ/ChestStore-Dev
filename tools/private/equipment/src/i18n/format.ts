// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Intl objects are costly and live
// outside V8's heap — one made per call (per row of a page) piles up
// hundreds of MiB before a collection frees it — so each is made once per
// language, zone and style, and kept (here, on the server and in the
// browser alike). Nowhere else in src/ makes one (test/sources.test.ts).
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

export const dateFormat = (locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(intl(locale), options));
export const numberFormat = (locale: Locale, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(intl(locale), options));
const pluralRules = (locale: Locale) => once(`p|${locale}`, () => new Intl.PluralRules(intl(locale)));
const relativeFormat = (locale: Locale) => once(`r|${locale}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));
// Texts in the language's order (a list of names): a.localeCompare(b,
// locale) would make a collator per comparison.
export const compareText = (locale: Locale): ((a: string, b: string) => number) => once(`c|${locale}`, () => new Intl.Collator(intl(locale))).compare;

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

// An instant in the reader's language, in the zone given (the reader's:
// member.timeZone). A day ("2026-10-15") is a day wherever one reads it:
// formatDay never shifts it. dayOne is how the language writes the first
// of a month beside a month's name (the catalogue's dates.dayOne: "1er" in
// French).
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, zone = "UTC", dayOne?: string): string {
  const f = dateFormat(locale, { timeZone: zone, ...options });
  const d = typeof value === "string" ? new Date(value) : value;
  if (!dayOne || options.day !== "numeric" || (options.month !== "long" && options.month !== "short")) return f.format(d);
  return f.formatToParts(d).map(p => (p.type === "day" && p.value === "1" ? dayOne : p.value)).join("");
}
export function formatDay(value: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, dayOne?: string): string {
  return formatDate(value.slice(0, 10) + "T00:00:00Z", locale, options, "UTC", dayOne);
}

// The day (YYYY-MM-DD) an instant falls on in a zone.
export function dayIn(at: Date | string, zone: string): string {
  const parts = Object.fromEntries(dateFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof at === "string" ? new Date(at) : at).map(p => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
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

// An amount of money in the Chest's currency, in cents: whole amounts
// without decimals ("€1,299"), others with two.
export function moneyText(cents: number, currency: string, locale: Locale): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  return numberFormat(locale, { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(cents / 100);
}

// Each language named in itself, never translated (a switch, a picker).
export const languageNames: Record<string, string> = { en: "English", fr: "Français" };
