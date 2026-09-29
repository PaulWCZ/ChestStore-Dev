import type { Member } from "@argentic/chest-sdk/member";
import { cycles as allCycles, type Cycle } from "./read.ts";
import type { Query } from "./db.ts";
import { format, formatDay, plural, type Catalogue, type Locale } from "./i18n/index.ts";
import { cycleTime, type Quarter } from "./model.ts";
import { people as lookup, type Person } from "./people.ts";
import { teams } from "./teams.ts";
import { clockAt } from "./tell.ts";
import { zone } from "./time.ts";

// What most pages need once: the clock (now, this week, today in the
// Chest's zone), the cycles, the teams' names, and a way to name people.
export async function context(sql: Query, actor: Member) {
  const clock = clockAt(new Date());
  const [cycleList, teamList] = await Promise.all([allCycles(sql), teams(sql, { archived: true })]);
  return {
    clock,
    zone: zone(),
    cycles: cycleList,
    teams: new Map(teamList.map(t => [t.id, t.name])),
    teamList,
    actor,
    people: async (ids: Iterable<string>): Promise<Map<string, Person>> => lookup([...ids, actor.id]),
  };
}

// A cycle's place in time, in words: "Week 6 of 13 · 48 days left".
export function cycleWords(cycle: Cycle, today: string, t: Catalogue, locale: Locale): { dates: string; when: string; elapsed: number } {
  const time = cycleTime(cycle, today);
  const dates = format(t.cycle.dates, { start: formatDay(cycle.startsOn, locale, { day: "numeric", month: "short" }), end: formatDay(cycle.endsOn, locale) });
  let when: string;
  if (cycle.closed) when = t.cycle.closed;
  else if (time.phase === "before") when = format(t.cycle.starts, { date: formatDay(cycle.startsOn, locale, { day: "numeric", month: "long" }) });
  else if (time.phase === "after") when = format(t.cycle.ended, { date: formatDay(cycle.endsOn, locale, { day: "numeric", month: "long" }) });
  else when = `${format(t.cycle.week, { week: time.week, weeks: time.weeks })} · ${plural(t.cycle.daysLeft, time.daysLeft, locale)}`;
  return { dates, when, elapsed: Math.round(time.elapsed * 100) };
}

// A quarter's name in the reader's words: "Q4 2026", "T4 2026".
export function quarterName(t: Catalogue, q: Quarter): string {
  return format(t.cycle.quarterName, { quarter: q.quarter, year: q.year });
}
