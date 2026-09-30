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

// A date in the reader's language, in the zone given: the reader's own
// (member.timeZone, SDK 0.3.0) for what happened, the Chest's for a
// company's day. Always given: a server's zone is nobody's.
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions & { timeZone: string }): string {
  return new Intl.DateTimeFormat(intl(locale), options).format(typeof value === "string" ? new Date(value) : value);
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

// moment says when something happened today ("10:02"), or which day and
// when ("12 Oct, 10:02"), in the reader's zone: member.timeZone on the
// server; in the browser, left out, the browser's own.
export function moment(value: Date | string, locale: Locale, now = new Date(), timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(intl(locale), { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  if (day(date) === day(now)) return time;
  return new Intl.DateTimeFormat(intl(locale), { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

// orList writes "Camille Martin, Tom Walker or Inès Moreau" in that
// language.
export function orList(items: string[], locale: Locale): string {
  return new Intl.ListFormat(intl(locale), { type: "disjunction" }).format(items);
}
