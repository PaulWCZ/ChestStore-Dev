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

// Dates in the reader's language and the Chest's time zone (Europe/Paris
// unless the tool is told otherwise — Proposal: a Chest time zone).
export const timeZone = "Europe/Paris";
export function formatDate(value: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
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

// A meeting's time as its reader sees it, in their zone: "Tuesday 6 October,
// 09:00" (with the year when it is not this year's).
export function meetingTime(value: Date | string, zone: string, locale: Locale, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const sameYear = new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(date) === new Intl.DateTimeFormat("en", { timeZone: zone, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat(intl(locale), { timeZone: zone, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit" }).format(date);
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string, zone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(typeof value === "string" ? new Date(value) : value);
}

// A zone as people read it: "Europe/Paris" → "Paris".
export function zoneName(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replace(/_/gu, " ");
}

// An amount of money, without cents: "45 000 €", "£45,000".
export function money(amount: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(intl(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// A file's size as people read it: "240 KB", "1.2 MB".
export function fileSize(bytes: number, locale: Locale): string {
  const units: [string, number][] = [["megabyte", 1 << 20], ["kilobyte", 1 << 10]];
  for (const [unit, size] of units) {
    if (bytes >= size) return new Intl.NumberFormat(intl(locale), { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: bytes >= 10 * size ? 0 : 1 }).format(bytes / size);
  }
  return new Intl.NumberFormat(intl(locale), { style: "unit", unit: "byte", unitDisplay: "short" }).format(bytes);
}
