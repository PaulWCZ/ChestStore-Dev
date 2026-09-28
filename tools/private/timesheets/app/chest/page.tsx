import { today, zone } from "../../lib/clock.ts";
import { db } from "../../lib/db.ts";
import { addDays, isDay, mondayOf } from "../../lib/days.ts";
import { dayEntries, week } from "../../lib/entries.ts";
import { clock, format, formatDay } from "../../lib/i18n/index.ts";
import { nameFor, people } from "../../lib/people.ts";
import { offeredProjects } from "../../lib/projects.ts";
import { viewer } from "../../lib/session.ts";
import { isLocked, settings } from "../../lib/settings.ts";
import { WeekView, type DayInfo, type DayItem } from "./week-view.tsx";

// My week: the grid of the week (projects and tasks × days) and the list of
// the chosen day. On a phone, the list of the day replaces the grid.
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const query = await searchParams;
  const now = today();
  const monday = isDay(query.week) ? mondayOf(query.week) : isDay(query.day) ? mondayOf(query.day) : mondayOf(now);
  const selected = isDay(query.day) && mondayOf(query.day) === monday ? query.day : mondayOf(now) === monday ? now : monday;
  const sql = db();
  const [w, list, projects, s] = await Promise.all([week(sql, member, monday), dayEntries(sql, member, selected), offeredProjects(sql, member), settings(sql)]);
  const who = s.lockedBy ? await people([s.lockedBy]) : new Map();
  const z = zone();
  const days: DayInfo[] = w.days.map(d => ({
    day: d,
    weekday: formatDay(d, locale, { weekday: "short" }),
    date: formatDay(d, locale, { day: "numeric" }),
    long: formatDay(d, locale, { weekday: "long", day: "numeric", month: "long" }),
    today: d === now,
    locked: isLocked(s, d),
  }));
  const items: DayItem[] = list.map(e => ({
    ...e,
    span: e.startedAt && e.endedAt ? format(t.day.span, { start: clock(e.startedAt, z, locale), end: clock(e.endedAt, z, locale) }) : null,
  }));
  return (
    <main className="page wide">
      <WeekView
        key={monday}
        monday={monday}
        previous={addDays(monday, -7)}
        next={addDays(monday, 7)}
        thisWeek={mondayOf(now) === monday}
        title={format(t.week.weekOf, { date: formatDay(monday, locale, { day: "numeric", month: "long", year: "numeric" }) })}
        days={days}
        rows={w.rows}
        selected={selected}
        items={items}
        projects={projects}
        locale={locale}
        lock={s.lockedUntil ? { text: format(t.week.lockedUntil, { date: formatDay(s.lockedUntil, locale, { day: "numeric", month: "long", year: "numeric" }), name: s.lockedBy ? nameFor(s.lockedBy, who, locale) : t.people.unknown }), short: format(t.week.lockedShort, { date: formatDay(s.lockedUntil, locale, { day: "numeric", month: "short" }) }) } : null}
        t={{ week: t.week, day: t.day, work: t.work, errors: t.errors, timer: t.timer }}
      />
    </main>
  );
}
