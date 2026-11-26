import { addDays, weekday } from "./repeat.ts";

// The month grid of the calendar view: weeks from Monday to Sunday, each
// day a "YYYY-MM-DD". Pure, used on the server (the names of months and
// days are written there: the browser's Intl may write them otherwise).

// monthOf reads "YYYY-MM" from the address; anything else is today's month.
export function monthOf(value: unknown, today: string): string {
  if (typeof value === "string" && /^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/u.test(value)) return value;
  return today.slice(0, 7);
}

// shift moves a month by n months.
export function shift(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// grid gives the weeks that show a month, whole weeks, Monday first.
export function grid(month: string): string[][] {
  const first = month + "-01";
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const next = shift(month, 1) + "-01";
  const weeks: string[][] = [];
  for (let day = start; day < next || weeks.length === 0; ) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// The timeline view: six weeks from a Monday, moved four weeks at a time.
export const timelineDays = 42;
export const timelineStep = 28;

// timelineStart reads the first day asked in the address ("YYYY-MM-DD", any
// day: its week's Monday); anything else is the Monday of last week, so
// the recent past shows too.
export function timelineStart(value: unknown, today: string): string {
  const asked = typeof value === "string" && /^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/u.test(value) && addDays(value, 0) === value ? value : addDays(today, -7);
  return addDays(asked, -((weekday(asked) + 6) % 7));
}

// daysBetween counts the days from one day to another (negative before).
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

// span is where a card's bar lies in a window: from its start (or its due
// date) to its due date (or its start), as day indexes; cut says the bar
// goes on past an edge; null when it has no date or lies outside.
export function span(card: { start: string | null; due: string | null }, first: string, days = timelineDays): { from: number; to: number; cutStart: boolean; cutEnd: boolean } | null {
  const a = card.start ?? card.due, b = card.due ?? card.start;
  if (!a || !b) return null;
  const [s, e] = a <= b ? [a, b] : [b, a];
  const from = daysBetween(first, s), to = daysBetween(first, e);
  if (to < 0 || from > days - 1) return null;
  return { from: Math.max(from, 0), to: Math.min(to, days - 1), cutStart: from < 0, cutEnd: to > days - 1 };
}

// shifted moves a card's dates by n days (a bar dragged); only the due
// date when end is set (the bar's end dragged), never before the start.
export function shifted(card: { start: string | null; due: string | null }, n: number, end = false): { start: string | null; due: string | null } {
  if (end) {
    const base = card.due ?? card.start;
    if (!base) return card;
    const due = addDays(base, n);
    return { start: card.start, due: card.start && due < card.start ? card.start : due };
  }
  return { start: card.start ? addDays(card.start, n) : null, due: card.due ? addDays(card.due, n) : null };
}

// The calendar's month, written on the server (src/pages/Board.tsx): its
// title, the days' names (Monday first), the weeks, the neighbouring
// months.
export type CalendarMonth = { month: string; title: string; weekdays: { short: string; long: string }[]; weeks: { date: string; day: number; inMonth: boolean; label: string }[][]; prev: string; next: string; today: string; current: string };

// The timeline's six weeks, written on the server: each day's number,
// weekday and name, the month where it starts, the neighbouring windows;
// and the name of every day a card starts or is due on (for the bars'
// labels).
export type TimelineWindow = {
  first: string;
  title: string;
  days: { date: string; day: number; weekday: string; month: string | null }[];
  prev: string;
  next: string;
  current: string;
  today: string;
  names: Record<string, string>;
  // For a phone: the window's weeks ("Week of 5 Oct") and each date short.
  weeks: { first: string; label: string }[];
  short: Record<string, string>;
};
