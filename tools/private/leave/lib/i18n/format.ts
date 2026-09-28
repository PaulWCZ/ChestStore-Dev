// Formatting helpers, free of the catalogues: client components import
// these without shipping every language's words.
type Locale = string;

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : new Intl.PluralRules(locale).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: new Intl.NumberFormat(locale).format(n), ...values });
}

// Dates in the reader's language and the Chest's time zone (Europe/Paris
// unless the tool is told otherwise — Proposal: a Chest time zone).
export const timeZone = "Europe/Paris";
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat(dateTag(locale), { timeZone, ...options }).format(typeof value === "string" ? new Date(value) : value);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 45) return rtf.format(0, "second");
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.345], ["month", 12], ["year", Infinity]];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), "year");
}

// English dates are written day first ("Mon 5 Oct"), as the tool's first
// readers — companies in France — write them.
export const dateTag = (locale: Locale): string => (locale === "en" ? "en-GB" : locale);

// A calendar day ("2026-10-05") in the reader's language: days are dates,
// not instants, so they are written in UTC, where they were made.
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(dateTag(locale), { timeZone: "UTC", ...options }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

// A number of days as the reader writes numbers: "2.5", "2,5", "12".
export function formatDays(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

// A leave's dates in words: "Mon 5 Oct", "Mon 5 Oct, morning",
// "Mon 5 – Fri 9 Oct", "Mon 5 Oct (afternoon) – Fri 9 Oct (morning)".
export type SpanWords = { readonly morning: string; readonly afternoon: string; readonly from: string; readonly to: string };
export function spanText(span: { start: string; startHalf: "am" | "pm"; end: string; endHalf: "am" | "pm" }, locale: Locale, words: SpanWords, options: { year?: boolean } = {}): string {
  const shape: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", ...(options.year ? { year: "numeric" } : {}) };
  if (span.start === span.end) {
    const one = formatDay(span.start, locale, shape);
    if (span.startHalf === "am" && span.endHalf === "pm") return one;
    return format(span.startHalf === "am" ? words.morning : words.afternoon, { day: one });
  }
  const first = span.startHalf === "pm" ? format(words.from, { day: formatDay(span.start, locale, shape) }) : formatDay(span.start, locale, shape);
  const last = span.endHalf === "am" ? format(words.to, { day: formatDay(span.end, locale, shape) }) : formatDay(span.end, locale, shape);
  return `${first} – ${last}`;
}
