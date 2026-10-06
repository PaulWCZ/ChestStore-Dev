// Words and formats, without the tool's catalogues: fill a text, choose a
// plural form, write dates, numbers and amounts in a reader's language and
// time zone, find a visitor's language. Safe in the browser too.

// fill puts values in a text's {placeholders}.
export const fill = (text: string, values: Record<string, string | number> = {}): string =>
  text.replace(/\{(\w+)\}/gu, (whole, key: string) => (key in values ? String(values[key]) : whole));

export type Plural = { readonly zero?: string; readonly one: string; readonly other: string };

// plural(locale, forms, n): the form of n in that language, {count}
// filled (French says "0 note", English "0 notes"). In an island too.
export function plural(locale: string, forms: Plural, n: number, values: Record<string, string | number> = {}): string {
  const tag = locale === "en" ? "en-GB" : locale;
  return fill(n === 0 && forms.zero !== undefined ? forms.zero : once(`p|${tag}`, () => new Intl.PluralRules(tag)).select(n) === "one" ? forms.one : forms.other, { count: numberFormat(tag).format(n), ...values });
}

// The language a tool speaks for a language tag: itself when the tool
// speaks it, else the first of the tool's languages (its source).
export const localeIn = <L extends string>(locales: readonly L[], language: string | null | undefined): L =>
  (locales as readonly (string | null | undefined)[]).includes(language) ? language as L : locales[0]!;

// A visitor's language on the public part: their choice (the cookie the
// switch sets), else the first of Accept-Language the tool speaks, else
// the Chest's own language, else the tool's first.
export function publicLocale<L extends string>(locales: readonly L[], cookie: string | undefined, accept: string | undefined, chestLanguage?: string): L {
  if ((locales as readonly string[]).includes(cookie ?? "")) return cookie as L;
  const ranked = (accept ?? "").split(",").slice(0, 16).map((part, index) => {
    const [tag = "", q] = part.trim().split(";q=");
    return { language: tag.toLowerCase().split("-")[0] ?? "", weight: q === undefined ? 1 : Number(q) || 0, index };
  }).filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return (ranked.map(r => r.language).find(l => (locales as readonly string[]).includes(l)) as L | undefined) ?? localeIn(locales, chestLanguage);
}

// Intl objects are costly and live outside V8's heap: one made per call
// (per row of a page) piles up hundreds of MiB before a GC frees them
// (measured: 427 MiB after 400 renders of a 30-row page). Each is made
// once per language, zone and style, and kept.
type Made = Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.RelativeTimeFormat;
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


// How a reader writes dates, times, numbers, amounts and plurals: their
// language, their time zone (a member's own; the Chest's for a visitor),
// the Chest's currency. Made on the server for each request: a page is
// sent already written, never formatted again in the browser.
export type Format = ReturnType<typeof formatter>;
export function formatter(locale: string, timeZone: string, currency = "EUR") {
  // English as written in Europe (day month year, 24-hour clock).
  const tag = locale === "en" ? "en-GB" : locale;
  return {
    locale,
    timeZone,
    // An instant (a timestamptz, a Date): in the reader's zone. A calendar
    // day ("2026-10-05", a date column) is f.day's, never these: a day read
    // as an instant shifts in zones west of UTC.
    date: (value: Date) => dateFormat(tag, timeZone, { day: "numeric", month: "short", year: "numeric" }).format(value),
    time: (value: Date) => dateFormat(tag, timeZone, { hour: "2-digit", minute: "2-digit" }).format(value),
    dateTime: (value: Date) => dateFormat(tag, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value),
    // A calendar day, "YYYY-MM-DD" (a date column, a field.day): the same
    // day everywhere.
    day: (iso: string) => dateFormat(tag, "UTC", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
    // Today in the reader's zone, "YYYY-MM-DD" (a member's own day; the
    // company's is chest.today(), and SQL's current_date and now()::date are
    // the company's too — the database session runs in the Chest's zone).
    today: (at: Date = new Date()) => {
      const parts = Object.fromEntries(dateFormat("en-US", timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map(p => [p.type, p.value]));
      return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
    },
    number: (n: number) => numberFormat(tag).format(n),
    // An amount in cents (field.money stores cents) or units: money(1250, { cents: true }).
    money: (amount: number, options: { cents?: boolean } = {}) => numberFormat(tag, { style: "currency", currency }).format(options.cents ? amount / 100 : amount),
    // The form of n in this language (French says "0 note", English "0 notes").
    plural: (forms: Plural, n: number, values: Record<string, string | number> = {}) => plural(locale, forms, n, values),
  };
}
