// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
type Locale = string;

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a report, per cell of a week) piles up hundreds of MiB on the
// server before a GC frees it. Each is made once per language, zone and
// style, and kept — the only place in the tool that makes one
// (test/stack.test.ts refuses `new Intl.` anywhere else).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.Collator;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
export const dates = (tag: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, style));
export const numbers = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// compare sorts names as the reader's language does ("Élodie" with the E's).
export const compare = (locale: Locale): ((a: string, b: string) => number) => once(`c|${locale}`, () => new Intl.Collator(intl(locale))).compare;

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : once(`p|${locale}`, () => new Intl.PluralRules(intl(locale))).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numbers(intl(locale)).format(n), ...values });
}

// An instant in the reader's language and a zone: the reader's own
// (member.timeZone) for when something happened — sent, approved, locked;
// the Chest's (src/lib/clock.ts) for the hours of an entry, which belong
// to the Chest's day.
export function formatDate(value: Date | string, zone: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dates(intl(locale), { timeZone: zone, ...options }).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = once(`r|${locale}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// A calendar day ("2026-09-21") in the reader's language: "Mon 21 Sep" and
// the like. Days are not instants: written as they are, whatever the zone.
// French writes the first of a month "1er" ("jeudi 1er octobre") when the
// month is written out in words beside it. thisYear ("2026"): a day of
// another year shows its year when the style names a month without one (a
// short date never hides that it is last year's).
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }, thisYear?: string): string {
  const shape = thisYear !== undefined && day.slice(0, 4) !== thisYear && options.month !== undefined && options.year === undefined ? { ...options, year: "numeric" as const } : options;
  const parts = dates(intl(locale), { timeZone: "UTC", ...shape }).formatToParts(new Date(day + "T00:00:00Z"));
  const first = locale === "fr" && (shape.month === "long" || shape.month === "short");
  return parts.map(p => (first && p.type === "day" && (p.value === "1" || p.value === "01") ? "1er" : p.value)).join("");
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string, zone: string, locale: Locale): string {
  return dates(intl(locale), { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof value === "string" ? new Date(value) : value);
}

// Money from minor units (cents): "€1,250.00", "1 250,00 €".
export function money(cents: number, currency: string, locale: Locale, options: { whole?: boolean } = {}): string {
  const digits = options.whole ? { maximumFractionDigits: 0 } : {};
  try {
    return numbers(intl(locale), { style: "currency", currency, ...digits }).format(cents / 100);
  } catch {
    return numbers(intl(locale), { maximumFractionDigits: 2 }).format(cents / 100) + " " + currency;
  }
}

// A number in the reader's language: "1.5" / "1,5". grouping: false for a
// file a program reads again ("1234,5", never "1 234,5").
export function decimal(value: number, locale: Locale, digits = 2, options: { grouping?: boolean } = {}): string {
  return numbers(intl(locale), { maximumFractionDigits: digits, ...(options.grouping === false ? { useGrouping: false } : {}) }).format(value);
}

// A share: "64 %".
export function percent(value: number, locale: Locale): string {
  return numbers(intl(locale), { style: "percent", maximumFractionDigits: 0 }).format(value);
}
