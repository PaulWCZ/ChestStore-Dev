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

// An instant in the reader's language and zone (member(request).timeZone:
// "store in UTC, show in the member's").
export function formatDate(value: Date | string, locale: Locale, timeZone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone, ...options }).format(typeof value === "string" ? new Date(value) : value);
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

// formatDay writes a calendar day (YYYY-MM-DD, or MM-DD for a birthday) in
// that language, whatever the server's time zone.
export function formatDay(value: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  const iso = /^\d{2}-\d{2}$/u.test(value) ? "2000-" + value : value;
  const f = new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", ...options });
  const date = new Date(iso + "T00:00:00Z");
  // French writes the first of a month "1er juin", never "1 juin".
  if (!locale.startsWith("fr") || iso.slice(8, 10) !== "01" || (options.month !== "long" && options.month !== "short") || options.day === undefined) return f.format(date);
  return f.formatToParts(date).map(p => (p.type === "day" ? p.value + "er" : p.value)).join("");
}

// relativeDays says "today", "yesterday", "6 days ago", "in 2 weeks"… for a
// number of days from today (negative: past).
export function relativeDays(days: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" });
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  if (Math.abs(days) < 31) return rtf.format(Math.round(days / 7), "week");
  return rtf.format(Math.round(days / 30.44), "month");
}

// The months of the year in that language, for a picker.
export function monthNames(locale: Locale): string[] {
  const f = new Intl.DateTimeFormat(intl(locale), { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2000, i, 1))));
}
