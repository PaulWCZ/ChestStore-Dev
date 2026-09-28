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

// An instant in the reader's language, in a time zone (the Chest's, which
// the server gives: lib/zone.ts).
export function formatDate(value: Date | string, locale: Locale, zone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone: zone, ...options }).format(typeof value === "string" ? new Date(value) : value);
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

// A day (YYYY-MM-DD) in words: "Tue 30 Sept", "mar. 30 sept.". A day has
// no time zone: it is written as the calendar says it.
export function formatDay(d: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(intl(locale), { ...options, timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
}

// A time of day from minutes after midnight, in that language's clock.
export function formatTime(minutes: number, locale: Locale): string {
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
  const text = new Intl.DateTimeFormat(intl(locale), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(date);
  return minutes === 1440 ? text.replace(/^0?0/u, "24") : text;
}

// "10:00–11:30".
export function formatSpan(start: number, end: number, locale: Locale): string {
  return formatTime(start, locale) + "–" + formatTime(end, locale);
}
