import { catalogue, format, formatDay, locales, type Locale } from "./i18n/index.ts";
import { quarterOf } from "./model.ts";

// A cycle's name, when the tool wrote it: the tool's own words, so each
// reader reads it in their language (store rule: data the tool generates is
// rendered, not stored as text). A calendar quarter is "Q1 2027" /
// "T1 2027"; any other period its months, "Aug – Nov 2026" /
// "août – nov. 2026". A cycle an admin named ("Autumn push") keeps its
// words as they were typed: `generated` is false for it.
export function periodName(startsOn: string, endsOn: string, locale: Locale): string {
  const t = catalogue(locale);
  const q = quarterOf(startsOn);
  if (q.startsOn === startsOn && q.endsOn === endsOn) return format(t.cycle.quarterName, { quarter: q.quarter, year: q.year });
  const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
  const month = (day: string, year: boolean) => formatDay(day, locale, year ? { month: "short", year: "numeric" } : { month: "short" });
  if (sameYear && startsOn.slice(0, 7) === endsOn.slice(0, 7)) return month(startsOn, true);
  return format(t.cycle.periodName, { start: month(startsOn, !sameYear), end: month(endsOn, true) });
}

// generatedName: is this the tool's own name for these dates, in any of its
// languages (the suggestion kept as it was, in whoever's language)?
export function generatedName(name: string, startsOn: string, endsOn: string): boolean {
  return locales.some(l => periodName(startsOn, endsOn, l) === name);
}

// cycleName: what a reader sees.
export function cycleName(cycle: { name: string; generated: boolean; startsOn: string; endsOn: string }, locale: Locale): string {
  return cycle.generated ? periodName(cycle.startsOn, cycle.endsOn, locale) : cycle.name;
}
