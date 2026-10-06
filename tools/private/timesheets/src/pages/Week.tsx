import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { clock, format, formatDate, formatDay, localeOf } from "../i18n/index.ts";
import type { DayInfo, DayItem, WeekStanding } from "../islands/WeekView.tsx";
import { can } from "../lib/access.ts";
import { today, zone } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { dayEntries, week } from "../lib/entries.ts";
import { nameFor, people } from "../lib/people.ts";
import { offeredProjects } from "../lib/projects.ts";
import { isLocked, settings } from "../lib/settings.ts";
import { addDays, isDay, mondayOf } from "../shared/days.ts";

// My week (/chest; ?week= a Monday, ?day= the day listed): the grid of the
// week (projects and tasks × days) and the list of the chosen day. On a
// phone, the list of the day replaces the grid. All of it is one island,
// keyed by its Monday.
export async function weekPage({ member, locale: lang, t, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  const now = today();
  const thisYear = now.slice(0, 4);
  const asked = query("week");
  const askedDay = query("day");
  const monday = isDay(asked) ? mondayOf(asked) : isDay(askedDay) ? mondayOf(askedDay) : mondayOf(now);
  const selected = isDay(askedDay) && mondayOf(askedDay) === monday ? askedDay : mondayOf(now) === monday ? now : monday;
  const sql = db();
  const [w, list, projects, s] = await Promise.all([week(sql, member, monday), dayEntries(sql, member, selected), offeredProjects(sql, member), settings(sql)]);
  const who = await people([...(s.lockedBy ? [s.lockedBy] : []), ...(w.state.decidedBy ? [w.state.decidedBy] : [])]);
  const decider = w.state.decidedBy ? nameFor(w.state.decidedBy, who, locale) : t.people.unknown;
  const standing: WeekStanding = {
    status: w.state.status,
    approvals: s.approvals || w.state.status === "approved",
    canSubmit: monday <= mondayOf(now),
    // Before Friday of the current week: "Send it early?", not "Done?".
    early: monday === mondayOf(now) && now < addDays(monday, 4),
    text: w.state.status === "approved" ? format(t.week.approvedBy, { name: decider, date: w.state.decidedAt ? formatDate(w.state.decidedAt, member.timeZone, locale, { day: "numeric", month: "short", ...(w.state.decidedAt.slice(0, 4) === thisYear ? {} : { year: "numeric" }) }) : "" })
      : w.state.status === "returned" ? format(t.week.returnedBy, { name: decider })
      : null,
    reason: w.state.status === "returned" ? w.state.reason : null,
  };
  const z = zone();
  const days: DayInfo[] = w.days.map(d => ({
    day: d,
    weekday: formatDay(d, locale, { weekday: "short" }),
    date: formatDay(d, locale, { day: "numeric" }),
    long: formatDay(d, locale, { weekday: "long", day: "numeric", month: "long" }, thisYear),
    today: d === now,
    locked: isLocked(s, d),
  }));
  const items: DayItem[] = list.map(e => ({
    ...e,
    span: e.startedAt && e.endedAt ? format(t.day.span, { start: clock(e.startedAt, z, locale), end: clock(e.endedAt, z, locale) }) : null,
  }));
  const title = format(t.week.weekOf, { date: formatDay(monday, locale, { day: "numeric", month: "long", year: "numeric" }) });
  return {
    title: t.shell.week,
    body: (
      <div className="page wide">
        <Island
          id={"week-" + monday}
          name="WeekView"
          props={{
            monday,
            previous: addDays(monday, -7),
            next: addDays(monday, 7),
            thisWeek: mondayOf(now) === monday,
            title,
            days,
            rows: w.rows,
            selected,
            items,
            projects,
            locale,
            standing,
            lock: s.lockedUntil ? { text: format(t.week.lockedUntil, { date: formatDay(s.lockedUntil, locale, { day: "numeric", month: "long", year: "numeric" }), name: s.lockedBy ? nameFor(s.lockedBy, who, locale) : t.people.unknown }), short: format(t.week.lockedShort, { date: formatDay(s.lockedUntil, locale, { day: "numeric", month: "short" }, thisYear) }) } : null,
            t: { week: t.week, day: t.day, work: t.work, errors: t.errors, timer: t.timer },
            canManage: can(member, "projects.manage"),
          }}
        />
      </div>
    ),
  };
}
