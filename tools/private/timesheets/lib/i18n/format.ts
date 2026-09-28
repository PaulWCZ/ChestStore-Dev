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

// An instant in the reader's language, as a clock of the Chest's time zone
// shows it (the zone comes from lib/clock.ts on the server).
export function formatDate(value: Date | string, zone: string, locale: Locale, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
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

// A calendar day ("2026-09-21") in the reader's language: "Mon 21 Sep" and
// the like. Days are not instants: written as they are, whatever the zone.
export function formatDay(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", ...options }).format(new Date(day + "T00:00:00Z"));
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string, zone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intl(locale), { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(typeof value === "string" ? new Date(value) : value);
}

// Money from minor units (cents): "€1,250.00", "1 250,00 €".
export function money(cents: number, currency: string, locale: Locale, options: { whole?: boolean } = {}): string {
  const digits = options.whole ? { maximumFractionDigits: 0 } : {};
  try {
    return new Intl.NumberFormat(intl(locale), { style: "currency", currency, ...digits }).format(cents / 100);
  } catch {
    return new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2 }).format(cents / 100) + " " + currency;
  }
}

// A number in the reader's language: "1.5" / "1,5".
export function decimal(value: number, locale: Locale, digits = 2): string {
  return new Intl.NumberFormat(intl(locale), { maximumFractionDigits: digits }).format(value);
}

// A share: "64 %".
export function percent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intl(locale), { style: "percent", maximumFractionDigits: 0 }).format(value);
}
