// Safe in the browser: no SDK here, no time zone. Days are "YYYY-MM-DD"
// strings, computed in UTC so that a day is always a day (a leave date is a
// date, not an instant).

export type Day = string;

const DAY = 86400000;
const toTime = (day: Day): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromTime = (time: number): Day => new Date(time).toISOString().slice(0, 10);

export const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;

// isDay says whether a text is a real calendar day between 2000 and 2100.
export function isDay(value: unknown): value is Day {
  if (typeof value !== "string" || !dayPattern.test(value)) return false;
  const time = toTime(value);
  const year = Number(value.slice(0, 4));
  return fromTime(time) === value && year >= 2000 && year <= 2100;
}

export function addDays(day: Day, n: number): Day {
  return fromTime(toTime(day) + n * DAY);
}

// daysBetween counts the days from a to b (b − a).
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toTime(b) - toTime(a)) / DAY);
}

// weekday: 0 Sunday, 1 Monday … 6 Saturday.
export function weekday(day: Day): number {
  return new Date(toTime(day)).getUTCDay();
}

// addMonths moves a day by n months; a day the target month lacks becomes
// its last (31 January + 1 month = 28 or 29 February).
export function addMonths(day: Day, n: number): Day {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(Number(day.slice(8, 10)), last));
  return fromTime(target.getTime());
}

export function monthStart(day: Day): Day {
  return day.slice(0, 7) + "-01";
}

export function monthEnd(day: Day): Day {
  return addDays(addMonths(monthStart(day), 1), -1);
}

// The days of a month ("YYYY-MM"), in order.
export function monthDays(month: string): Day[] {
  const first = month + "-01";
  const count = daysBetween(first, addMonths(first, 1));
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

export const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/u;

// ---------------------------------------------------------------------------
// French public holidays (Code du travail, art. L3133-1: eleven days), and
// the two more of Alsace-Moselle (art. L3134-13: Good Friday, 26 December).
// Easter by the anonymous Gregorian algorithm (Meeus/Jones/Butcher); the
// others follow from it (Easter Monday +1, Ascension +39, Whit Monday +50).
export const nationalHolidays = ["newYear", "easterMonday", "labourDay", "victory", "ascension", "whitMonday", "bastille", "assumption", "allSaints", "armistice", "christmas"] as const;
export const alsaceHolidays = ["goodFriday", "stStephen"] as const;
export type HolidayKey = (typeof nationalHolidays)[number] | (typeof alsaceHolidays)[number];
export const holidayKeys: readonly HolidayKey[] = [...nationalHolidays, ...alsaceHolidays];
export const isHolidayKey = (value: unknown): value is HolidayKey => typeof value === "string" && (holidayKeys as readonly string[]).includes(value);

export function easter(year: number): Day {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type Holiday = { day: Day; key: HolidayKey };

export function holidays(year: number, options: { alsace?: boolean } = {}): Holiday[] {
  const e = easter(year);
  const fixed = (md: string): Day => `${year}-${md}`;
  const list: Holiday[] = [
    { day: fixed("01-01"), key: "newYear" },
    { day: addDays(e, 1), key: "easterMonday" },
    { day: fixed("05-01"), key: "labourDay" },
    { day: fixed("05-08"), key: "victory" },
    { day: addDays(e, 39), key: "ascension" },
    { day: addDays(e, 50), key: "whitMonday" },
    { day: fixed("07-14"), key: "bastille" },
    { day: fixed("08-15"), key: "assumption" },
    { day: fixed("11-01"), key: "allSaints" },
    { day: fixed("11-11"), key: "armistice" },
    { day: fixed("12-25"), key: "christmas" },
  ];
  if (options.alsace) list.push({ day: addDays(e, -2), key: "goodFriday" }, { day: fixed("12-26"), key: "stStephen" });
  return list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// The holidays between two days (inclusive), as a map day → key.
export function holidaysBetween(from: Day, to: Day, options: { alsace?: boolean } = {}): Map<Day, HolidayKey> {
  const found = new Map<Day, HolidayKey>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) for (const h of holidays(y, options)) if (h.day >= from && h.day <= to) found.set(h.day, h.key);
  return found;
}

// The public holidays a company does not work, between two days: all of
// them (and Alsace-Moselle's if it is there), but those it works.
export function daysOffFor(rules: { alsace: boolean; workedHolidays: readonly string[] }, from: Day, to: Day): Map<Day, HolidayKey> {
  const found = holidaysBetween(from, to, { alsace: rules.alsace });
  for (const [day, key] of found) if (rules.workedHolidays.includes(key)) found.delete(day);
  return found;
}

// ---------------------------------------------------------------------------
// What a leave costs, in days.
//
// A span runs from its first day (from the morning, or from the afternoon
// only) to its last day (to the evening, or to noon only). Its cost counts
// the days the chosen rule counts, a half for a half day:
//
// - "ouvres" (jours ouvrés): Monday to Friday, public holidays not worked
//   excluded. The usual rule: 25 days a year.
// - "ouvrables" (jours ouvrables): Monday to Saturday, public holidays not
//   worked excluded — and, when the leave ends on the last worked day of a
//   week, the Saturday that follows before the person comes back counts too
//   (a week off Monday to Friday costs 6 jours ouvrables). 30 days a year.
// - "calendar": every day, holidays and week-ends included (sick leave is
//   usually counted so).
export type Half = "am" | "pm";
export const isHalf = (value: unknown): value is Half => value === "am" || value === "pm";
export type Span = { start: Day; startHalf: Half; end: Day; endHalf: Half };
export type Counting = "ouvres" | "ouvrables" | "calendar";
// daysOff: the public holidays the company does not work.
export type Rules = { counting: Counting; daysOff: ReadonlySet<Day> | ReadonlyMap<Day, unknown> };

// A span is well formed when it ends after it starts: on a single day,
// "from the afternoon to noon" is not a time.
export function spanValid(span: Span): boolean {
  if (!isDay(span.start) || !isDay(span.end) || !isHalf(span.startHalf) || !isHalf(span.endHalf)) return false;
  if (span.end < span.start) return false;
  if (span.end === span.start && span.startHalf === "pm" && span.endHalf === "am") return false;
  return true;
}

// isHalfDaySpan: the span has a half day at either end.
export const hasHalf = (span: Span): boolean => span.startHalf === "pm" || span.endHalf === "am";

function counted(day: Day, rules: Rules): boolean {
  if (rules.counting === "calendar") return true;
  const wd = weekday(day);
  if (wd === 0) return false;
  if (wd === 6 && rules.counting === "ouvres") return false;
  return !rules.daysOff.has(day);
}

// A worked day of the company: Monday to Friday, not a holiday it takes off.
const worked = (day: Day, rules: Rules): boolean => weekday(day) >= 1 && weekday(day) <= 5 && !rules.daysOff.has(day);

// cost is what a span takes, in the rules' days (a multiple of ½). tail:
// false leaves out the jours-ouvrables Saturday after the end (a span cut
// at a month's end, whose rest counts it).
export function cost(span: Span, rules: Rules, options: { tail?: boolean } = {}): number {
  if (!spanValid(span)) return 0;
  let halves = 0;
  const last = daysBetween(span.start, span.end);
  for (let i = 0; i <= last; i++) {
    const day = addDays(span.start, i);
    if (!counted(day, rules)) continue;
    let h = 2;
    if (i === 0 && span.startHalf === "pm") h -= 1;
    if (i === last && span.endHalf === "am") h -= 1;
    halves += Math.max(h, 0);
  }
  // Jours ouvrables: the Saturday between the leave's end and the return.
  if (rules.counting === "ouvrables" && span.endHalf === "pm" && options.tail !== false) {
    for (let d = addDays(span.end, 1), n = 0; n < 7 && !worked(d, rules); d = addDays(d, 1), n++) {
      if (weekday(d) === 6 && !rules.daysOff.has(d)) halves += 2;
    }
  }
  return halves / 2;
}

// The half-day slots of a span, to tell whether two spans overlap: day i's
// morning is 2i, its afternoon 2i + 1.
export function slots(span: Span): [number, number] {
  const base = Math.round(toTime(span.start) / DAY);
  const endBase = Math.round(toTime(span.end) / DAY);
  return [base * 2 + (span.startHalf === "pm" ? 1 : 0), endBase * 2 + (span.endHalf === "am" ? 0 : 1)];
}

export function overlaps(a: Span, b: Span): boolean {
  const [a1, a2] = slots(a);
  const [b1, b2] = slots(b);
  return a1 <= b2 && b1 <= a2;
}

// What a span covers of one day: "full", "am", "pm", or null.
export function coverage(span: Span, day: Day): "full" | Half | null {
  if (day < span.start || day > span.end) return null;
  const am = !(day === span.start && span.startHalf === "pm");
  const pm = !(day === span.end && span.endHalf === "am");
  return am && pm ? "full" : am ? "am" : pm ? "pm" : null;
}

// clip keeps the part of a span inside [from, to] (whole days at the cut).
export function clip(span: Span, from: Day, to: Day): Span | null {
  if (span.end < from || span.start > to) return null;
  const start = span.start < from ? { start: from, startHalf: "am" as Half } : { start: span.start, startHalf: span.startHalf };
  const end = span.end > to ? { end: to, endHalf: "pm" as Half } : { end: span.end, endHalf: span.endHalf };
  return { ...start, ...end };
}

// ---------------------------------------------------------------------------
// Earned leave: a yearly amount earned month by month (French paid leave:
// 2.5 jours ouvrables, or 25/12 ≈ 2.08 jours ouvrés, per month worked — art.
// L3141-3). A month is earned once complete: someone counting from 15 March
// earns their first month on 15 April. The reference period starts on the
// first day of a month the company chooses (1 June by default).
export function completedMonths(from: Day, to: Day): number {
  if (to < from) return 0;
  let n = Math.max(0, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) - 1);
  while (addMonths(from, n + 1) <= to) n++;
  return n;
}

export function periodStart(today: Day, startMonth: number): Day {
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  return thisYear <= today ? thisYear : `${year - 1}-${String(startMonth).padStart(2, "0")}-01`;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// earned: what someone counting from `from` has earned by `today`, and how
// much of it in the current reference period.
export function earned(from: Day, today: Day, perYear: number, startMonth: number): { total: number; thisPeriod: number; months: number } {
  const months = completedMonths(from, today);
  const start = periodStart(today, startMonth);
  // A month belongs to the period it was worked in: one completed on the
  // period's first day was worked in the period before.
  const before = start > from ? completedMonths(from, start) : 0;
  const total = round2((months * perYear) / 12);
  return { total, thisPeriod: round2(total - round2((before * perYear) / 12)), months };
}
