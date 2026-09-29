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
