import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, Filters } from "@argentic/chest-ui/components";
import { Back, Next } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { addDays, addMonths, clip, coverage, fullWeek, monthDays, monthEnd, monthPattern, weekday, type Day } from "../shared/calendar.ts";
import { db } from "../lib/db.ts";
import { everyoneOrNone, groupMembers, groups as chestGroups } from "../lib/directory.ts";
import { compare, format, formatDay, spanText } from "../i18n/index.ts";
import { today } from "../lib/today.ts";
import { nameOf, people } from "../lib/people.ts";
import { between, type Entry } from "../lib/requests.ts";
import { daysOff, settings, types } from "../lib/rules.ts";
import { approvees, staffOf } from "../lib/staff.ts";
import { typeName } from "../shared/type-name.ts";

// Who is away: a month, one row per person, one column per day — approved
// leave in its colour (or "Away" for those who may not know why), leave
// still waiting for an answer lighter and striped, public holidays and
// week-ends shaded. On a phone, the same month as a list of days.
export async function calendarPage({ member, locale, t, query }: PageContext<MemberContext>): Promise<View> {
  const sql = db();
  const asked = query("month");
  const now = today();
  const thisYear = now.slice(0, 4);
  const month = typeof asked === "string" && monthPattern.test(asked) && asked >= "2000-01" && asked <= "2100-12" ? asked : now.slice(0, 7);
  const first = month + "-01";
  const last = monthEnd(first);
  // The phone's list runs to the end of the month's last week: an absence
  // that starts or goes on after the month's end is still in "this week".
  const listEnd = addDays(last, (7 - weekday(last)) % 7);
  const [entries, s, all, dir, teams, mine] = await Promise.all([
    between(sql, member, first, listEnd),
    settings(sql),
    types(sql, { archived: true }),
    everyoneOrNone(),
    chestGroups(),
    can(member, "approve") ? approvees(sql, member.id) : Promise.resolve([] as string[]),
  ]);
  const show = query("show") ?? "all";
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const off = daysOff(s, first, last);
  const offList = daysOff(s, first, listEnd);
  const days = monthDays(month);

  // The rows: everyone who has the tool (or, without the Chest, everyone
  // with leave this month), me first, then by name; filtered.
  const ids = new Set([...dir.people.map(p => p.id), ...entries.filter(e => e.start <= last).map(e => e.memberId)]);
  const who = await people(ids);
  let rows = [...ids];
  const inGroup = teams.some(g => g.id === show) ? await groupMembers(show) : null;
  if (show === "mine") rows = rows.filter(id => id === member.id || mine.includes(id));
  else if (inGroup) rows = rows.filter(id => inGroup.includes(id));
  const order = new Map(dir.people.map((p, i) => [p.id, i]));
  rows.sort((a, b) => (a === member.id ? -1 : b === member.id ? 1 : (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || compare(locale)(nameOf(who.get(a), locale), nameOf(who.get(b), locale))));
  const shownEntries = entries.filter(e => rows.includes(e.memberId));
  // Each person's week: the days they do not work are shaded in their row.
  const weeks = await staffOf(sql, rows);
  const worksOn = (id: string, d: Day) => (weeks.get(id)?.workDays ?? fullWeek).includes(weekday(d));
  const byPerson = new Map<string, Entry[]>();
  for (const e of shownEntries.filter(x => x.start <= last)) byPerson.set(e.memberId, [...(byPerson.get(e.memberId) ?? []), e]);

  const monthName = formatDay(first, locale, { month: "long", year: "numeric" });
  const link = (m: string, sh = show) => `/chest/calendar?month=${m}${sh !== "all" ? `&show=${encodeURIComponent(sh)}` : ""}`;
  const what = (e: Entry) => (e.typeId ? typeName(typeOf.get(e.typeId), t.types) : t.calendar.away) + (e.status === "pending" ? ` (${t.calendar.pending.toLowerCase()})` : "");
  const remote = shownEntries.some(e => !e.away && e.start <= last);
  const colorOf = (e: Entry) => (e.typeId ? typeOf.get(e.typeId)?.color ?? "sky" : "away");
  const halfWord = (c: "full" | "am" | "pm") => (c === "full" ? t.calendar.allDay : c === "am" ? t.calendar.morning : t.calendar.afternoon);

  // Whose absences: everyone (no filter), the people I answer for, a Chest
  // group — chips kept in the address (the kit's Filters).
  const filters = [
    ...(mine.length > 0 ? [{ value: "mine", label: t.calendar.myPeople }] : []),
    ...teams.map(g => ({ value: g.id, label: g.name })),
  ];

  const shows = (d: Day) => weekday(d) !== 0 && weekday(d) !== 6 && !off.has(d);
  const joins = (e: Entry, d: Day, step: 1 | -1) => {
    const other = addDays(d, step);
    return shows(other) && worksOn(e.memberId, other) && coverage(e, other) === "full" && coverage(e, d) === "full";
  };

  // The phone's list: one card per absence, by week, from today in the
  // current month to the end of its last week (past the month's end); the
  // public holidays in their week.
  const from = month === now.slice(0, 7) ? now : first;
  const mondayOf = (d: Day) => addDays(d, -((weekday(d) + 6) % 7));
  const cards = shownEntries.filter(e => e.end >= from && e.start <= listEnd).map(e => ({ e, part: clip(e, from, listEnd)! })).filter(c => c.part);
  const holidaysAhead = [...offList].filter(([d]) => d >= from && weekday(d) !== 0 && weekday(d) !== 6);
  const listWeeks = [...new Set([...cards.map(c => mondayOf(c.part.start < from ? from : c.part.start)), ...holidaysAhead.map(([d]) => mondayOf(d))])].sort();

  return {
    title: t.calendar.title,
    body: (
      <div className="page wide">
        <Island name="AutoRefresh" props={{ seconds: 60 }} />
        <div className="cal-head">
          <h1>{t.calendar.title}</h1>
          <nav className="month-nav" aria-label={monthName}>
            <a className="icon-button" href={link(addMonths(first, -1).slice(0, 7))} aria-label={t.calendar.previous}><Back /></a>
            <span className="month-name" aria-live="polite">{monthName}</span>
            <a className="icon-button" href={link(addMonths(first, 1).slice(0, 7))} aria-label={t.calendar.next}><Next /></a>
            {month !== now.slice(0, 7) && <a className="button quiet small" href={link(now.slice(0, 7))}>{t.calendar.today}</a>}
          </nav>
        </div>
        {filters.length > 0 && (
          <Filters
            path="/chest/calendar"
            params={{ month, ...(filters.some(f => f.value === show) ? { show } : {}) }}
            groups={[{ key: "show", label: t.calendar.show, all: true, options: filters }]}
            labels={{ label: t.calendar.show, all: t.calendar.everyone, clear: t.calendar.everyone }}
          />
        )}
        <ul className="legend">
          <li><span className="swatch k-away" />{t.calendar.approved}</li>
          <li><span className="swatch k-sky pending" />{t.calendar.pending}</li>
          <li><span className="swatch holiday" />{t.calendar.holiday}</li>
          <li><span className="swatch weekend" />{t.calendar.weekend}</li>
          {remote && <li><span className="swatch k-sea" />{t.calendar.remote}</li>}
        </ul>
        {!dir.reached && <p className="notice">{t.calendar.unreachable}</p>}

        {rows.length === 0 ? <EmptyState title={t.calendar.noPeople} /> : (
          <div className="grid-wrap">
            <table className="grid">
              <caption className="visually-hidden">{format(t.calendar.caption, { month: monthName })}</caption>
              <thead>
                <tr>
                  <th scope="col" className="who-col">{t.calendar.person}</th>
                  {days.map(d => {
                    const h = off.get(d);
                    const wd = weekday(d);
                    return (
                      <th key={d} scope="col" className={dayClass(d, wd, h !== undefined, now)} title={h ? t.holidays[h] : undefined}>
                        <span className="wd">{formatDay(d, locale, { weekday: "narrow" })}</span>
                        <span className="dn">{Number(d.slice(8))}</span>
                        {h && <span className="visually-hidden">{t.holidays[h]}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(id => {
                  const p = who.get(id);
                  const name = id === member.id ? t.people.you : nameOf(p, locale);
                  const list = byPerson.get(id) ?? [];
                  return (
                    <tr key={id} className={id === member.id ? "mine-row" : undefined}>
                      <th scope="row" className="who-col"><span className="person-cell"><Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size="s" /><span>{name}</span></span></th>
                      {days.map(d => {
                        const wd = weekday(d);
                        // Nobody is "away" on a day nobody works: bars skip
                        // week-ends and public holidays, and join across
                        // the days they span.
                        const rest = !worksOn(id, d) && wd !== 0 && wd !== 6;
                        const here = shows(d) && !rest ? list.map(e => ({ e, c: coverage(e, d) })).filter(x => x.c !== null) as { e: Entry; c: "full" | "am" | "pm" }[] : [];
                        return (
                          <td key={d} className={dayClass(d, wd, off.has(d), now) + (rest ? " rest" : "")}>
                            {here.length > 0 && (
                              <span className="slot">
                                {here.map(({ e, c }) => (
                                  <span key={e.id} className={`bar ${c} k-${colorOf(e)}${e.status === "pending" ? " pending" : ""}${joins(e, d, -1) ? " from-prev" : ""}${joins(e, d, 1) ? " to-next" : ""}`} title={format(t.calendar.cell, { name, what: what(e), when: spanText(e, locale, t.span, { thisYear }) })}>
                                    <span className="visually-hidden">{format(t.calendar.cell, { name, what: what(e), when: halfWord(c) })}</span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="day-list">
          {listWeeks.length === 0 ? <p className="muted">{t.calendar.nobody}</p> : listWeeks.map(monday => {
            const sunday = addDays(monday, 6);
            const inWeek = cards.filter(c => mondayOf(c.part.start < from ? from : c.part.start) === monday);
            const hols = holidaysAhead.filter(([d]) => d >= monday && d <= sunday);
            return (
              <section key={monday} className="week-group" aria-label={format(t.calendar.weekOf, { day: formatDay(monday, locale, { day: "numeric", month: "long" }, thisYear) })}>
                <h2 className="day-title">{format(t.calendar.weekOf, { day: formatDay(monday, locale, { day: "numeric", month: "long" }, thisYear) })}</h2>
                <ul>
                  {hols.map(([d, key]) => (
                    <li key={d} className="holiday-row"><span className="holiday-tag">{t.holidays[key]}</span><span className="muted small">{formatDay(d, locale, undefined, thisYear)}</span></li>
                  ))}
                  {inWeek.map(({ e }) => {
                    const p = who.get(e.memberId);
                    return (
                      <li key={e.id} className={e.status === "pending" ? "pending-row" : undefined}>
                        <Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size="s" />
                        <span className="day-who"><strong>{e.memberId === member.id ? t.people.you : nameOf(p, locale)}</strong><span className="muted small">{spanText(e, locale, t.span, { thisYear })}</span></span>
                        <span className={`kind small k-${colorOf(e)}${e.status === "pending" ? " pending" : ""}`}>{what(e)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    ),
  };
}

function dayClass(d: Day, wd: number, holiday: boolean, now: Day): string {
  return ["day-col", wd === 0 || wd === 6 ? "weekend" : "", holiday ? "holiday" : "", d === now ? "today" : ""].filter(Boolean).join(" ");
}
