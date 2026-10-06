// Writing for a reader — dates in their language and time zone, plurals,
// amounts, file sizes, "3 minutes ago" — free of the catalogues and of any
// server code: the pages (on the server) and the islands (in the browser)
// import it alike.
//
// Every Intl object is made once per language, zone and style, and kept:
// one made per call (per row of a page, per free time of an interview)
// lives outside V8's heap and piles up hundreds of MiB before a GC frees
// it. This is the only file of the tool that makes one (test/stack.test.ts
// holds it so).
type Locale = string;
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.DisplayNames | Intl.Collator;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
export const dateFormat = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { timeZone, ...style }));
export const numberFormat = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));
const pluralRules = (tag: string) => once(`p|${tag}`, () => new Intl.PluralRules(tag));
const relativeFormat = (tag: string) => once(`r|${tag}`, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
export const regionNames = (tag: string) => once(`g|${tag}`, () => new Intl.DisplayNames([tag], { type: "region" }));
export const collator = (tag: string) => once(`c|${tag}`, () => new Intl.Collator(tag, { sensitivity: "base" }));

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
// language, then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(intl(locale)).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(intl(locale)).format(n), ...values });
}

// A number as the reader writes it ("1 500", "4,5"), at most `decimals`.
export const numberText = (n: number, locale: Locale, decimals = 0): string => numberFormat(intl(locale), { maximumFractionDigits: decimals }).format(n);

// The year an instant is in a zone.
const yearIn = (value: Date, zone: string) => dateFormat("en-US", zone, { year: "numeric" }).format(value);

// An instant in the reader's language and zone (a member's own; the
// Chest's for a visitor). Without a year in the options, the year is
// written when it is not this year's.
export function formatDate(value: Date | string, locale: Locale, zone: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const style = options.year === undefined && options.month !== undefined && yearIn(date, zone) !== yearIn(now, zone) ? { ...options, year: "numeric" as const } : options;
  return dateFormat(intl(locale), zone, style).format(date);
}

// A calendar day, "YYYY-MM-DD", the same wherever the reader is: "Monday 12
// October" (with the year when it is not this year's).
export function dayLabel(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }, now = new Date()): string {
  const at = new Date(day.slice(0, 10) + "T12:00:00Z");
  const style = options.year === undefined && options.month !== undefined && String(at.getUTCFullYear()) !== yearIn(now, "UTC") ? { ...options, year: "numeric" as const } : options;
  return dateFormat(intl(locale), "UTC", style).format(at);
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const rtf = relativeFormat(intl(locale));
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
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

// A meeting's time as its reader sees it, in a zone: "Tuesday 6 October,
// 09:00" (with the year when it is not this year's).
export function meetingTime(value: Date | string, zone: string, locale: Locale, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const sameYear = yearIn(date, zone) === yearIn(now, zone);
  return dateFormat(intl(locale), zone, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit" }).format(date);
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string, zone: string, locale: Locale): string {
  return dateFormat(intl(locale), zone, { hour: "2-digit", minute: "2-digit" }).format(typeof value === "string" ? new Date(value) : value);
}

// A zone as people read it: "Europe/Paris" → "Paris".
export function zoneName(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replace(/_/gu, " ");
}

// An amount of money, without cents: "45 000 €", "£45,000".
export function money(amount: number, currency: string, locale: Locale): string {
  return numberFormat(intl(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// A file's size as people read it: "240 KB", "1.2 MB".
export function fileSize(bytes: number, locale: Locale): string {
  const units: [string, number][] = [["megabyte", 1 << 20], ["kilobyte", 1 << 10]];
  for (const [unit, size] of units) {
    if (bytes >= size) return numberFormat(intl(locale), { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: bytes >= 10 * size ? 0 : 1 }).format(bytes / size);
  }
  // Bytes in words ("193 bytes", "193 octets"): the short style writes
  // "193 byte" in English.
  return numberFormat(intl(locale), { style: "unit", unit: "byte", unitDisplay: "long" }).format(bytes);
}

// ---- Instants and wall times in a zone (the Chest's, for interviews) ----

// offset: how far a zone is ahead of UTC at an instant, in milliseconds.
export function offset(instant: number, zone: string): number {
  const parts = dateFormat("en-US", zone, { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// dayOf: the day ("YYYY-MM-DD") an instant falls on in a zone.
export function dayOf(instant: Date | string, zone: string): string {
  const parts = dateFormat("en-CA", zone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// timeOf: the time of day ("09:30") an instant is in a zone.
export function timeOf(instant: Date | string, zone: string): string {
  const parts = dateFormat("en-GB", zone, { hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
