// Formatting helpers, free of the catalogues: client components import
// these without shipping every language's words. Every date is written in
// a time zone the caller names (the Chest's, or the visitor's).
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page, per tick of a 90-day bar) piles up hundreds of MiB
// before a collection frees them. Each is made once per language, zone and
// style, and kept (a bounded map: a page asks a handful).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  let found = made.get(key) as T | undefined;
  if (!found) {
    if (made.size >= 400) made.clear();
    made.set(key, (found = make()));
  }
  return found;
}
const dates = (tag: string, options: Intl.DateTimeFormatOptions) => once(`d|${tag}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(tag, options));
const numbers = (tag: string, options: Intl.NumberFormatOptions = {}) => once(`n|${tag}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(tag, options));

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : once(`p|${intl(locale)}`, () => new Intl.PluralRules(intl(locale))).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numbers(intl(locale)).format(n), ...values });
}

const asDate = (value: Date | string | number) => (value instanceof Date ? value : new Date(value));

// A moment: "28 Sept 2026, 14:05" (the year only when it is not this
// year's, in that zone).
export function moment(value: Date | string | number, zone: string, locale: Locale, now = new Date()): string {
  const date = asDate(value);
  const year = (d: Date) => dates("en", { timeZone: zone, year: "numeric" }).format(d);
  return dates(intl(locale), { timeZone: zone, day: "numeric", month: "short", ...(year(date) === year(now) ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

// A moment with the zone's short name: "28 Sept, 14:05 CEST".
export function stamp(value: Date | string | number, zone: string, locale: Locale, now = new Date()): string {
  return `${moment(value, zone, locale, now)} ${zoneAbbreviation(value, zone, locale)}`;
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string | number, zone: string, locale: Locale): string {
  return dates(intl(locale), { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(asDate(value));
}

// A day written "YYYY-MM-DD", as people read it: "Monday 28 September".
export function day(date: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return dates(intl(locale), { timeZone: "UTC", ...options }).format(new Date(date + "T12:00:00Z"));
}

// A month written "YYYY-MM": "September 2026".
export function month(value: string, locale: Locale): string {
  const text = dates(intl(locale), { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(value + "-15T12:00:00Z"));
  return text.charAt(0).toLocaleUpperCase(intl(locale)) + text.slice(1);
}

// The short name of a zone at a moment: "CEST", "GMT+2"…
export function zoneAbbreviation(value: Date | string | number, zone: string, locale: Locale): string {
  const part = dates(intl(locale), { timeZone: zone, timeZoneName: "short" }).formatToParts(asDate(value)).find(p => p.type === "timeZoneName");
  return part?.value ?? zone;
}

// A zone as people read it: "Europe/Paris" → "Paris".
export function zoneName(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replace(/_/gu, " ");
}

// A length of time in words the catalogue gives: "2 h 5 min", "3 d 4 h".
export function duration(ms: number, words: { minutes: string; hoursMinutes: string; hours: string; daysHours: string }): string {
  const total = Math.max(1, Math.round(ms / 60000));
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (d > 0) return format(words.daysHours, { d, h });
  if (h > 0) return format(m === 0 ? words.hours : words.hoursMinutes, { h, m });
  return format(words.minutes, { m });
}

// A percentage with two decimals, rounded down: "99.95%", "99,95 %".
export function percent(value: number, locale: Locale): string {
  return numbers(intl(locale), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.floor(value * 100 + 1e-9) / 10000);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string | number, locale: Locale, now = new Date()): string {
  const seconds = Math.round((asDate(value).getTime() - now.getTime()) / 1000);
  const rtf = once(`r|${intl(locale)}`, () => new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" }));
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
