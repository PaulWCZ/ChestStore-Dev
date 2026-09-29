import Link from "next/link";
import { Avatar } from "../../../components/avatar.tsx";
import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { Back, Next } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { addDays, addMonths, clip, coverage, fullWeek, monthDays, monthEnd, monthPattern, weekday, type Day } from "../../../lib/calendar.ts";
import { db } from "../../../lib/db.ts";
import { everyoneOrNone, groups as chestGroups } from "../../../lib/directory.ts";
import { format, formatDay, spanText } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { between, type Entry } from "../../../lib/requests.ts";
import { daysOff, settings, types } from "../../../lib/rules.ts";
import { viewer } from "../../../lib/session.ts";
import { approvees, staffOf } from "../../../lib/staff.ts";
import { typeName } from "../../../lib/type-name.ts";

// Who is away: a month, one row per person, one column per day — approved
// leave in its colour (or "Away" for those who may not know why), leave
// still waiting for an answer lighter and striped, public holidays and
// week-ends shaded. On a phone, the same month as a list of days.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; show?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const params = await searchParams;
  const now = today();
  const month = typeof params.month === "string" && monthPattern.test(params.month) && params.month >= "2000-01" && params.month <= "2100-12" ? params.month : now.slice(0, 7);
  const first = month + "-01";
  const last = monthEnd(first);
  const [entries, s, all, dir, teams, mine] = await Promise.all([
    between(sql, member, first, last),
    settings(sql),
    types(sql, { archived: true }),
    everyoneOrNone(),
    chestGroups(),
    can(member, "approve") ? approvees(sql, member.id) : Promise.resolve([] as string[]),
  ]);
  const show = params.show ?? "all";
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const off = daysOff(s, first, last);
  const days = monthDays(month);

  // The rows: everyone who has the tool (or, without the Chest, everyone
  // with leave this month), me first, then by name; filtered.
  const ids = new Set([...dir.people.map(p => p.id), ...entries.map(e => e.memberId)]);
  const who = await people(ids);
  let rows = [...ids];
  const group = teams.find(g => g.id === show);
  if (show === "mine") rows = rows.filter(id => id === member.id || mine.includes(id));
  else if (group) rows = rows.filter(id => group.members.includes(id));
  const order = new Map(dir.people.map((p, i) => [p.id, i]));
  rows.sort((a, b) => (a === member.id ? -1 : b === member.id ? 1 : (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || nameOf(who.get(a), locale).localeCompare(nameOf(who.get(b), locale), locale)));
  const shownEntries = entries.filter(e => rows.includes(e.memberId));
  // Each person's week: the days they do not work are shaded in their row.
  const weeks = await staffOf(sql, rows);
  const worksOn = (id: string, d: Day) => (weeks.get(id)?.workDays ?? fullWeek).includes(weekday(d));
  const byPerson = new Map<string, Entry[]>();
  for (const e of shownEntries) byPerson.set(e.memberId, [...(byPerson.get(e.memberId) ?? []), e]);

  const monthName = formatDay(first, locale, { month: "long", year: "numeric" });
  const link = (m: string, sh = show) => `/chest/calendar?month=${m}${sh !== "all" ? `&show=${encodeURIComponent(sh)}` : ""}`;
  const what = (e: Entry) => (e.typeId ? typeName(typeOf.get(e.typeId), t.types) : t.calendar.away) + (e.status === "pending" ? ` (${t.calendar.pending.toLowerCase()})` : "");
  const remote = shownEntries.some(e => !e.away);
  const colorOf = (e: Entry) => (e.typeId ? typeOf.get(e.typeId)?.color ?? "sky" : "away");
  const halfWord = (c: "full" | "am" | "pm") => (c === "full" ? t.calendar.allDay : c === "am" ? t.calendar.morning : t.calendar.afternoon);

  const filters = [
    { key: "all", label: t.calendar.everyone },
    ...(mine.length > 0 ? [{ key: "mine", label: t.calendar.myPeople }] : []),
    ...teams.map(g => ({ key: g.id, label: g.name })),
  ];

  const shows = (d: Day) => weekday(d) !== 0 && weekday(d) !== 6 && !off.has(d);
  const joins = (e: Entry, d: Day, step: 1 | -1) => {
    const other = addDays(d, step);
    return shows(other) && worksOn(e.memberId, other) && coverage(e, other) === "full" && coverage(e, d) === "full";
  };

  // The phone's list: one card per absence, by week, from today in the
  // current month; the public holidays in their week.
  const from = month === now.slice(0, 7) ? now : first;
  const mondayOf = (d: Day) => addDays(d, -((weekday(d) + 6) % 7));
  const cards = shownEntries.filter(e => e.end >= from).map(e => ({ e, part: clip(e, from, last)! })).filter(c => c.part);
  const holidaysAhead = [...off].filter(([d]) => d >= from && weekday(d) !== 0 && weekday(d) !== 6);
  const listWeeks = [...new Set([...cards.map(c => mondayOf(c.part.start < from ? from : c.part.start)), ...holidaysAhead.map(([d]) => mondayOf(d))])].sort();

  return (
    <main className="page wide">
      <AutoRefresh seconds={60} />
      <div className="cal-head">
        <h1>{t.calendar.title}</h1>
        <nav className="month-nav" aria-label={monthName}>
          <Link className="icon-button" href={link(addMonths(first, -1).slice(0, 7))} aria-label={t.calendar.previous}><Back /></Link>
          <span className="month-name" aria-live="polite">{monthName}</span>
          <Link className="icon-button" href={link(addMonths(first, 1).slice(0, 7))} aria-label={t.calendar.next}><Next /></Link>
          {month !== now.slice(0, 7) && <Link className="button quiet small" href={link(now.slice(0, 7))}>{t.calendar.today}</Link>}
        </nav>
      </div>
      {filters.length > 1 && (
        <nav className="pills" aria-label={t.calendar.show}>
          {filters.map(f => <Link key={f.key} href={link(month, f.key)} aria-current={show === f.key || (f.key === "all" && !filters.some(x => x.key === show)) ? "true" : undefined}>{f.label}</Link>)}
        </nav>
      )}
      <ul className="legend">
        <li><span className="swatch k-away" />{t.calendar.approved}</li>
        <li><span className="swatch k-sky pending" />{t.calendar.pending}</li>
        <li><span className="swatch holiday" />{t.calendar.holiday}</li>
        <li><span className="swatch weekend" />{t.calendar.weekend}</li>
        {remote && <li><span className="swatch k-sea" />{t.calendar.remote}</li>}
      </ul>
      {!dir.reached && <p className="notice">{t.calendar.unreachable}</p>}

      {rows.length === 0 ? <p className="empty">{t.calendar.noPeople}</p> : (
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
                    <th scope="row" className="who-col"><span className="person-cell"><Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size={24} /><span>{name}</span></span></th>
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
                                <span key={e.id} className={`bar ${c} k-${colorOf(e)}${e.status === "pending" ? " pending" : ""}${joins(e, d, -1) ? " from-prev" : ""}${joins(e, d, 1) ? " to-next" : ""}`} title={format(t.calendar.cell, { name, what: what(e), when: spanText(e, locale, t.span) })}>
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
            <section key={monday} className="week-group" aria-label={format(t.calendar.weekOf, { day: formatDay(monday, locale, { day: "numeric", month: "long" }) })}>
              <h2 className="day-title">{format(t.calendar.weekOf, { day: formatDay(monday, locale, { day: "numeric", month: "long" }) })}</h2>
              <ul>
                {hols.map(([d, key]) => (
                  <li key={d} className="holiday-row"><span className="holiday-tag">{t.holidays[key]}</span><span className="muted small">{formatDay(d, locale)}</span></li>
                ))}
                {inWeek.map(({ e }) => {
                  const p = who.get(e.memberId);
                  return (
                    <li key={e.id} className={e.status === "pending" ? "pending-row" : undefined}>
                      <Avatar name={p?.name ?? ""} photo={p?.photo ?? null} size={28} />
                      <span className="day-who"><strong>{e.memberId === member.id ? t.people.you : nameOf(p, locale)}</strong><span className="muted small">{spanText(e, locale, t.span)}</span></span>
                      <span className={`kind small k-${colorOf(e)}${e.status === "pending" ? " pending" : ""}`}>{what(e)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function dayClass(d: Day, wd: number, holiday: boolean, now: Day): string {
  return ["day-col", wd === 0 || wd === 6 ? "weekend" : "", holiday ? "holiday" : "", d === now ? "today" : ""].filter(Boolean).join(" ");
}
