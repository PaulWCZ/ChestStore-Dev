// Formatting helpers, free of the catalogues: client components import
// these without shipping every language's words.
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : new Intl.PluralRules(intl(locale)).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: new Intl.NumberFormat(intl(locale)).format(n), ...values });
}

// An instant in the reader's language and in a zone the caller names: the
// reader's (member.timeZone) for what is shown to them, the Chest's
// (lib/zone.ts) for what is the company's.
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  const shape: Intl.DateTimeFormatOptions = Object.keys(options).some(k => k !== "timeZone") ? {} : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(intl(locale), { ...shape, ...options }).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" });
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
// ("€12,500" in English, "12 500 €" in French); whole euros unless cents
// are asked for, or "€12.5K" / "12,5 k€" when compact.
export function money(cents: number, locale: Locale, options: { cents?: boolean; compact?: boolean; currency?: string } = {}): string {
  const value = cents / 100;
  return new Intl.NumberFormat(intl(locale), {
    style: "currency",
    currency: options.currency ?? "EUR",
    ...(options.compact ? { notation: "compact", maximumFractionDigits: 1 } : { minimumFractionDigits: options.cents ? 2 : 0, maximumFractionDigits: options.cents ? 2 : 0 }),
  }).format(value);
}

// formatDay writes a day (YYYY-MM-DD) as it is, whatever the time zone.
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(intl(locale), { ...options, timeZone: "UTC" }).format(new Date(day + "T00:00:00Z"));
}
