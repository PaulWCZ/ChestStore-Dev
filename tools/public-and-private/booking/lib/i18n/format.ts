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
