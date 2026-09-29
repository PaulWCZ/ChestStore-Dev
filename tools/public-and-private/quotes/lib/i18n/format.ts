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

// Dates in the reader's language. An instant is written in the Chest's
// time zone (chest.timeZone(), given by the server: never guessed here); a
// day ("2026-09-28") is a calendar day, written as it is, whatever the zone.
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  return new Intl.DateTimeFormat(intl(locale), options).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat(intl(locale), { ...options, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}

// A day as French paperwork writes it: 28/09/2026 (and 28/09/2026 in
// English too: the documents are European).
export function numericDay(day: string): string {
  return day.split("-").reverse().join("/");
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
