// Formatting helpers, free of the catalogues: islands import these without
// shipping every language's words. Safe in the browser.
type Locale = string;

// The conventions of a language for dates and numbers: English is written
// as in Europe (day month year, 24-hour clock), not as in the US.
export function intl(locale: Locale): string {
  return locale === "en" ? "en-GB" : locale;
}

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page, per day of a month grid) piles up hundreds of MiB on
// the server before a GC frees it. Each is made once per language, zone and
// style, and kept (here, in the server's process and in the browser alike).
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat | Intl.ListFormat;
const made = new Map<string, Made>();
function once<T extends Made>(key: string, make: () => T): T {
  if (made.size > 500) made.clear();
  let found = made.get(key) as T | undefined;
  if (!found) made.set(key, (found = make()));
  return found;
}
// A date format of a language tag ("en-GB", "fr") in a zone, made once.
export const dateFormat = (tag: string, timeZone: string, style: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  once(`d|${tag}|${timeZone}|${JSON.stringify(style)}`, () => new Intl.DateTimeFormat(tag, { ...style, timeZone }));
export const numberFormat = (tag: string, style: Intl.NumberFormatOptions = {}): Intl.NumberFormat => once(`n|${tag}|${JSON.stringify(style)}`, () => new Intl.NumberFormat(tag, style));
const pluralRules = (tag: string) => once(`p|${tag}`, () => new Intl.PluralRules(tag));
const relativeFormat = (tag: string) => once(`r|${tag}`, () => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
export const listFormat = (locale: Locale, type: "conjunction" | "disjunction" = "conjunction") => once(`l|${intl(locale)}|${type}`, () => new Intl.ListFormat(intl(locale), { type }));

// format fills the {placeholders} of a text.
export function format(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

// plural picks the form of a { zero?, one, other } entry for n in that
// language (Intl.PluralRules), then fills {count}.
export function plural(forms: { readonly one: string; readonly other: string; readonly zero?: string }, n: number, locale: Locale, values: Record<string, string | number> = {}): string {
  const tag = intl(locale);
  const form = n === 0 && forms.zero !== undefined ? forms.zero : pluralRules(tag).select(n) === "one" ? forms.one : forms.other;
  return format(form, { count: numberFormat(tag).format(n), ...values });
}

// relative says "3 minutes ago", "yesterday"… in that language.
export function relative(value: Date | string, locale: Locale, now = new Date()): string {
  const seconds = Math.round(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 1000);
  const rtf = relativeFormat(intl(locale));
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
  const year = dateFormat("en", zone, { year: "numeric" });
  const sameYear = year.format(date) === year.format(now);
  return dateFormat(intl(locale), zone, { weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit" }).format(date);
}

// A time of day, "09:30", in a zone.
export function clock(value: Date | string, zone: string, locale: Locale): string {
  return dateFormat(intl(locale), zone, { hour: "2-digit", minute: "2-digit" }).format(typeof value === "string" ? new Date(value) : value);
}

// A calendar day ("2026-10-08") in words, the same in every zone:
// "Thursday 8 October" (options: which parts, the year when asked).
export function dayWords(day: string, locale: Locale, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return dateFormat(intl(locale), "UTC", options).format(new Date(day + "T12:00:00Z"));
}

// A zone as people read it: "Europe/Paris" → "Paris"; cities: the
// catalogue's names of cities ("Europe/Brussels" → "Bruxelles").
export function zoneName(zone: string, cities: Readonly<Record<string, string>> = {}): string {
  return cities[zone] ?? (zone.split("/").at(-1) ?? zone).replace(/_/gu, " ");
}

// Whether a name starts with a vowel: some languages write a word before
// it otherwise (French "d’Inès", not "de Inès"); the catalogue holds both
// sentences, the same where the language elides nothing.
export const startsWithVowel = (name: string) => /^[aeiouyàâäæéèêëîïôöœùûüÿ]/iu.test(name.trim());

// firstUpper writes the first letter of a text as a capital, and nothing
// else: a date alone on a line ("jeudi 8 octobre" → "Jeudi 8 octobre"),
// never every word (French writes days and months in lower case).
export function firstUpper(text: string, locale: Locale): string {
  return text.charAt(0).toLocaleUpperCase(intl(locale)) + text.slice(1);
}

// The end of a time range on its day: "24:00" for the midnight that ends
// it (a whole day blocked), not the next day's "00:00".
export function endClock(start: Date, end: Date, zone: string, locale: Locale): string {
  const text = clock(end, zone, locale);
  return text === clock(new Date(0), "UTC", locale) && end.getTime() > start.getTime() && end.getTime() - start.getTime() <= 86400000 ? "24:00" : text;
}
