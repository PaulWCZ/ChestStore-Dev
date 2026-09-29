// Calendar days as ISO dates ("2026-09-29"): no time, no time zone. All
// arithmetic is done in UTC on whole days, and names come from the words
// (DateWords), never from Intl — so a date reads the same when the server
// renders it and when the browser hydrates it, whatever the machine's
// locale or time zone. "Today" is always given by the tool (from the
// Chest's time zone, on the server): the kit never reads the clock to
// decide which day it is.
import { fill, fold } from "./text.js";
import type { DateWords } from "./words.js";

export type IsoDate = string;

const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const day = 86_400_000;

function toUtc(iso: IsoDate): number {
  const m = isoPattern.exec(iso);
  if (!m) throw new RangeError(`not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

// isIsoDate: "YYYY-MM-DD" and a real day (no 31 June).
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const m = isoPattern.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function isoOf(year: number, month: number, date: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

export function partsOf(iso: IsoDate): { year: number; month: number; day: number } {
  const m = isoPattern.exec(iso);
  if (!m) throw new RangeError(`not an ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromUtc(toUtc(iso) + n * day);
}

// addMonths keeps the day when it exists, else the month's last day
// (31 January + 1 month = 28 or 29 February).
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const { year, month, day: d } = partsOf(iso);
  const index = year * 12 + (month - 1) + n;
  const y = Math.floor(index / 12);
  const mo = (index % 12) + 1;
  return isoOf(y, mo, Math.min(d, daysInMonth(y, mo)));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / day);
}

// weekday: 0 = Monday … 6 = Sunday (ISO order, the order of the words).
export function weekday(iso: IsoDate): number {
  return (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
}

export function clampDate(iso: IsoDate, min?: IsoDate | null, max?: IsoDate | null): IsoDate {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

// startOfWeek: the first day of iso's week, weeks starting on Monday (1)
// or Sunday (0).
export function startOfWeek(iso: IsoDate, weekStart: 0 | 1 = 1): IsoDate {
  const offset = weekStart === 1 ? weekday(iso) : (weekday(iso) + 1) % 7;
  return addDays(iso, -offset);
}

export type CalendarDay = { iso: IsoDate; inMonth: boolean };

// monthGrid: the weeks of a month as a calendar shows them, with the days
// of the months around it to fill the first and last weeks (always six
// weeks, so the popover never changes height).
export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): CalendarDay[][] {
  const first = isoOf(year, month, 1);
  let cursor = startOfWeek(first, weekStart);
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const p = partsOf(cursor);
      week.push({ iso: cursor, inMonth: p.month === month && p.year === year });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// weekdayHeads: the short names of the week's days in the calendar's order.
export function weekdayHeads(words: DateWords): { short: string; long: string }[] {
  const order = words.weekStart === 1 ? [0, 1, 2, 3, 4, 5, 6] : [6, 0, 1, 2, 3, 4, 5];
  return order.map(i => ({ short: words.weekdaysShort[i] ?? "", long: words.weekdays[i] ?? "" }));
}

// formatDate in the tool's language, from the words alone:
//   numeric: 29/09/2026 (the order and separator of the language)
//   short:   Tue 29 Sep       long: Tuesday 29 September 2026
//   month:   September 2026
export function formatDate(iso: IsoDate, words: DateWords, style: "numeric" | "short" | "long" | "month" = "numeric"): string {
  const { year, month, day: d } = partsOf(iso);
  if (style === "numeric") {
    const dd = String(d).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const yyyy = String(year).padStart(4, "0");
    const parts = words.order === "dmy" ? [dd, mm, yyyy] : words.order === "mdy" ? [mm, dd, yyyy] : [yyyy, mm, dd];
    return parts.join(words.separator);
  }
  const values = { weekday: words.weekdays[weekday(iso)] ?? "", day: String(d), month: words.months[month - 1] ?? "", year: String(year) };
  if (style === "month") return fill(words.monthYear, values);
  if (style === "short") return fill(words.short, { ...values, weekday: words.weekdaysShort[weekday(iso)] ?? "", month: words.monthsShort[month - 1] ?? "" });
  return fill(words.long, values);
}

// monthByName: "sept", "Septembre", "sep." → 9 (accents and case aside,
// at least three letters, the full or short name of the language — and
// English's, which people type everywhere).
const englishMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function monthByName(word: string, words: DateWords): number | null {
  const w = fold(word).replace(/\.$/u, "");
  if (w.length < 3) return null;
  const lists = [words.months.map(fold), words.monthsShort.map(m => fold(m).replace(/\.$/u, "")), englishMonths];
  for (const list of lists) {
    const i = list.findIndex(name => name === w || (name.startsWith(w) && w.length >= 3));
    if (i >= 0) return i + 1;
  }
  return null;
}

// parseDate reads what a person types, in their language:
//   "29/09/2026", "29-9-26", "29.09.2026", "29/9" (this year), "29"
//   (this month), "2026-09-29" (ISO, always), "29 sept 2026", "29 September",
//   and the words for today, tomorrow and yesterday.
// It returns null when it cannot read a real day. `today` comes from the
// tool (the Chest's time zone).
export function parseDate(text: string, words: DateWords, today: IsoDate): IsoDate | null {
  const raw = text.trim();
  if (!raw) return null;
  if (isIsoDate(raw)) return raw;
  const folded = fold(raw);
  if (folded === fold(words.today) || folded === "today") return today;
  if (folded === fold(words.tomorrow) || folded === "tomorrow") return addDays(today, 1);
  if (folded === fold(words.yesterday) || folded === "yesterday") return addDays(today, -1);
  const now = partsOf(today);
  const year = (y: string | undefined): number | null => {
    if (y === undefined || y === "") return now.year;
    if (!/^\d{2}$|^\d{4}$/u.test(y)) return null;
    return y.length === 2 ? 2000 + Number(y) : Number(y);
  };
  const make = (y: number | null, m: number, d: number): IsoDate | null => {
    if (y === null || m < 1 || m > 12 || d < 1) return null;
    const iso = isoOf(y, m, d);
    return isIsoDate(iso) ? iso : null;
  };
  // With a month's name: "29 sept 2026", "sept 29, 2026".
  const named = /^(\d{1,2})(?:er)?\s*([\p{L}.]+)\.?\s*(\d{2}|\d{4})?$/u.exec(folded) ?? null;
  if (named) {
    const m = monthByName(named[2] ?? "", words);
    if (m) return make(year(named[3]), m, Number(named[1]));
  }
  const namedFirst = /^([\p{L}.]+)\s*(\d{1,2}),?\s*(\d{2}|\d{4})?$/u.exec(folded);
  if (namedFirst) {
    const m = monthByName(namedFirst[1] ?? "", words);
    if (m) return make(year(namedFirst[3]), m, Number(namedFirst[2]));
  }
  // Digits: the language's order.
  const parts = folded.split(/[\s/.\-]+/u).filter(Boolean);
  if (!parts.every(p => /^\d+$/u.test(p)) || parts.length === 0 || parts.length > 3) return null;
  if (parts.length === 1) {
    const only = parts[0]!;
    if (only.length === 8) {
      // 29092026 (dmy/mdy) or 20260929 (ymd)
      if (words.order === "ymd") return make(Number(only.slice(0, 4)), Number(only.slice(4, 6)), Number(only.slice(6)));
      const [a, b] = [Number(only.slice(0, 2)), Number(only.slice(2, 4))];
      return words.order === "dmy" ? make(Number(only.slice(4)), b, a) : make(Number(only.slice(4)), a, b);
    }
    if (only.length > 2) return null;
    return make(now.year, now.month, Number(only));
  }
  if (words.order === "ymd") {
    if (parts.length === 2) return make(now.year, Number(parts[0]), Number(parts[1]));
    return make(year(parts[0]), Number(parts[1]), Number(parts[2]));
  }
  const [a, b, c] = parts;
  const first = Number(a);
  const second = Number(b);
  return words.order === "dmy" ? make(year(c), second, first) : make(year(c), first, second);
}

// The keyboard of a calendar grid (the WAI-ARIA date picker pattern):
// arrows move a day or a week, Home/End go to the week's ends, Page Up and
// Page Down a month (with Shift: a year). Returns the new focused day, or
// null when the key is not the calendar's.
export function calendarKey(focus: IsoDate, key: string, options: { shift?: boolean; weekStart?: 0 | 1; min?: IsoDate | null; max?: IsoDate | null } = {}): IsoDate | null {
  const weekStart = options.weekStart ?? 1;
  let next: IsoDate | null = null;
  switch (key) {
    case "ArrowLeft": next = addDays(focus, -1); break;
    case "ArrowRight": next = addDays(focus, 1); break;
    case "ArrowUp": next = addDays(focus, -7); break;
    case "ArrowDown": next = addDays(focus, 7); break;
    case "Home": next = startOfWeek(focus, weekStart); break;
    case "End": next = addDays(startOfWeek(focus, weekStart), 6); break;
    case "PageUp": next = addMonths(focus, options.shift ? -12 : -1); break;
    case "PageDown": next = addMonths(focus, options.shift ? 12 : 1); break;
    default: return null;
  }
  return clampDate(next, options.min, options.max);
}

// relativeDay names today, tomorrow and yesterday; null otherwise.
export function relativeDay(iso: IsoDate, today: IsoDate, words: DateWords): string | null {
  const n = daysBetween(today, iso);
  return n === 0 ? words.today : n === 1 ? words.tomorrow : n === -1 ? words.yesterday : null;
}

// Months as "YYYY-MM" (MonthField, 0.2.1).
export type YearMonth = string;

export function isYearMonth(value: unknown): value is YearMonth {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/u.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

// addYearMonths: "2026-11" + 3 → "2027-02".
export function addYearMonths(ym: YearMonth, n: number): YearMonth {
  const total = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5)) - 1 + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// monthsFrom: every month from `first` to `last`, both included (at most 600).
export function monthsFrom(first: YearMonth, last: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  for (let m = first; m <= last && out.length < 600; m = addYearMonths(m, 1)) out.push(m);
  return out;
}

// A range of days, both ends included (0.2.2). Either end may be missing
// while it is being chosen.
export type DateRange = { readonly from: IsoDate | null; readonly to: IsoDate | null };

// moveRangeStart: a new first day keeps the range's length (the leave that
// started on Monday and moves to Wednesday still lasts three days); with no
// length yet, the last day only moves when the first would pass it.
// `keepLength: false` (0.2.3): the last day stays unless the first passes
// it — a filter's range ("from … to …"), whose length means nothing.
export function moveRangeStart(range: DateRange, from: IsoDate | null, { keepLength = true }: { keepLength?: boolean } = {}): DateRange {
  if (from === null) return { from: null, to: range.to };
  if (keepLength && range.from !== null && range.to !== null && isIsoDate(range.from) && isIsoDate(range.to)) return { from, to: addDays(from, Math.max(0, daysBetween(range.from, range.to))) };
  return { from, to: range.to !== null && range.to < from ? from : range.to };
}

// moveRangeEnd: a last day never before the first (it becomes the first).
export function moveRangeEnd(range: DateRange, to: IsoDate | null): DateRange {
  if (to === null || range.from === null) return { from: range.from, to };
  return { from: range.from, to: to < range.from ? range.from : to };
}

// rangeDays: how many days the range holds, both ends included; null
// while an end is missing.
export function rangeDays(range: DateRange): number | null {
  if (range.from === null || range.to === null || !isIsoDate(range.from) || !isIsoDate(range.to)) return null;
  return daysBetween(range.from, range.to) + 1;
}

// readTypedDate: what a DateField does with the text typed in it (0.2.4)
// — "" is no date; a date it reads within min…max is that date;
// anything else is refused with the sentence shown under the field (in
// the words' language): a text it cannot read, a day before `min`, a day
// after `max`. A refused text never passes for the old date: the
// field keeps the text, says the problem, and is invalid until corrected.
export type TypedDate = { readonly ok: true; readonly value: IsoDate | null } | { readonly ok: false; readonly problem: string; readonly reason: "invalid" | "too_early" | "too_late" };
export function readTypedDate(raw: string, words: DateWords, today: IsoDate, { min = null, max = null }: { min?: IsoDate | null; max?: IsoDate | null } = {}): TypedDate {
  if (raw.trim() === "") return { ok: true, value: null };
  const iso = parseDate(raw, words, today);
  if (!iso) return { ok: false, reason: "invalid", problem: fill(words.invalid, { example: formatDate(today, words) }) };
  if (min && iso < min) return { ok: false, reason: "too_early", problem: fill(words.tooEarly, { date: formatDate(min, words, "long") }) };
  if (max && iso > max) return { ok: false, reason: "too_late", problem: fill(words.tooLate, { date: formatDate(max, words, "long") }) };
  return { ok: true, value: iso };
}

// typedDateComplete: whether a text being typed is a whole date that more
// typing could not turn into another day (0.2.5) — a DateField that says
// a problem clears it, and sends the date, as soon as the corrected text
// is one, so that leaving the field moves nothing under the pointer.
// Whole: an ISO date, eight digits, a date ending in a four-digit year
// ("1/1/2026", "29 sept 2026", "Oct 5, 2026"; in ymd order, a four-digit
// year first and a two-digit day last), or the word for today, tomorrow
// or yesterday. Not whole: "29/10" (a year may follow), "1/1/2" or
// "1/1/20" (half a year: never year 2, nor 2020), "2026-09-3". A text
// that is not whole is read on blur, as before.
export function typedDateComplete(raw: string, words: DateWords): boolean {
  const text = raw.trim();
  if (text === "") return false;
  if (isIsoDate(text) || /^\d{8}$/u.test(text)) return true;
  const folded = fold(text);
  if ([words.today, words.tomorrow, words.yesterday, "today", "tomorrow", "yesterday"].some(w => fold(w) === folded)) return true;
  const yearLast = /\D\d{4}$/u.test(folded);
  if (/\p{L}/u.test(folded)) return yearLast; // a month's name: its year ends it
  if (words.order === "ymd") return /^\d{4}[\s/.\-]+\d{1,2}[\s/.\-]+\d{2}$/u.test(folded);
  return yearLast;
}
