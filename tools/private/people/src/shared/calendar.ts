import { addDays, daysBetween } from "./model.ts";

// Safe in the browser: no SDK here.
// The moments of the directory, from its dates: who is new (started in the
// last 30 days), who arrives soon, birthdays (only those shown by their
// person: day and month) and work anniversaries this month.
type Dated = { startDate: string | null; birthday: string | null };

export function newcomers<T extends Dated>(people: readonly T[], now: string, days = 30): T[] {
  const from = addDays(now, -days);
  return people.filter(p => p.startDate !== null && p.startDate >= from && p.startDate <= now).sort((a, b) => b.startDate!.localeCompare(a.startDate!));
}

export function arriving<T extends Dated>(people: readonly T[], now: string, days = 60): T[] {
  const until = addDays(now, days);
  return people.filter(p => p.startDate !== null && p.startDate > now && p.startDate <= until).sort((a, b) => a.startDate!.localeCompare(b.startDate!));
}

export type Moment<T> = { person: T; kind: "birthday" | "anniversary"; date: string; years: number; past: boolean };

// This month's birthdays and anniversaries, in the order of the days; a
// 29 February birthday falls on the 28th in other years.
export function thisMonth<T extends Dated>(people: readonly T[], now: string): Moment<T>[] {
  const year = Number(now.slice(0, 4));
  const month = now.slice(5, 7);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const found: Moment<T>[] = [];
  for (const person of people) {
    if (person.birthday && person.birthday.slice(0, 2) === month) {
      const d = person.birthday === "02-29" && !leap ? "02-28" : person.birthday;
      const date = `${year}-${d}`;
      found.push({ person, kind: "birthday", date, years: 0, past: date < now });
    }
    if (person.startDate && person.startDate.slice(5, 7) === month) {
      const years = year - Number(person.startDate.slice(0, 4));
      const d = person.startDate.slice(5) === "02-29" && !leap ? "02-28" : person.startDate.slice(5);
      if (years >= 1) found.push({ person, kind: "anniversary", date: `${year}-${d}`, years, past: `${year}-${d}` < now });
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

// How long someone has been here, in whole years and months.
export function tenure(start: string, now: string): { years: number; months: number; days: number } {
  let months = (Number(now.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(now.slice(5, 7)) - Number(start.slice(5, 7));
  if (now.slice(8) < start.slice(8)) months--;
  months = Math.max(months, 0);
  return { years: Math.floor(months / 12), months: months % 12, days: Math.max(daysBetween(start, now), 0) };
}
