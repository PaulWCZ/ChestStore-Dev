import { forbidden, Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, StatusBadge } from "@argentic/chest-ui/components";
import { Back, Next } from "../components/icons.tsx";
import { format, formatDate, formatDay, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { today } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { nameFor, people } from "../lib/people.ts";
import { capacities, personWeek } from "../lib/weeks.ts";
import { addDays, isDay, mondayOf, weekDays } from "../shared/days.ts";
import { formatDuration } from "../shared/duration.ts";
import { memberPattern } from "../shared/model.ts";

// One person's week (/chest/team/:member; ?week= a Monday), as a manager
// reads it before approving: hours per project and day, every entry with
// its note; approve or send back.
export async function personWeekPage({ member, locale: lang, t, param, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "approve")) forbidden();
  const memberId = param("member");
  if (!memberPattern.test(memberId)) notFound();
  const now = mondayOf(today());
  const thisYear = today().slice(0, 4);
  const asked = query("week");
  const week = isDay(asked) ? mondayOf(asked) : addDays(now, -7);
  const sql = db();
  const [{ state, entries }, who, caps] = await Promise.all([personWeek(sql, member, memberId, week), people([memberId]), capacities(sql, [memberId])]);
  const person = who.get(memberId);
  if (!person || person.status === "unknown") return notFound();
  const decider = state.decidedBy ? nameFor(state.decidedBy, await people([state.decidedBy]), locale) : "";
  const name = nameFor(memberId, who, locale);
  const days = weekDays(week);
  const total = entries.reduce((n, e) => n + e.minutes, 0);
  const billable = entries.filter(e => e.billable).reduce((n, e) => n + e.minutes, 0);
  const rows = new Map<string, { name: string; client: string | null; color: string; cells: number[] }>();
  for (const e of entries) {
    const key = `${e.projectId}:${e.taskName ?? ""}`;
    const row = rows.get(key) ?? { name: e.taskName ? `${e.projectName} · ${e.taskName}` : e.projectName, client: e.clientName, color: e.color, cells: days.map(() => 0) };
    row.cells[days.indexOf(e.day)]! += e.minutes;
    rows.set(key, row);
  }
  const when = (at: string, style: Intl.DateTimeFormatOptions) => formatDate(at, member.timeZone, locale, at.slice(0, 4) === thisYear ? style : { ...style, year: "numeric" });
  const statusText = state.status === "approved" ? format(t.week.approvedBy, { name: decider, date: state.decidedAt ? when(state.decidedAt, { day: "numeric", month: "short" }) : "" })
    : state.status === "returned" ? `${format(t.week.returnedBy, { name: decider })} “${state.reason}”`
    : state.status === "submitted" ? format(t.team.sentOn, { date: state.submittedAt ? when(state.submittedAt, { weekday: "long", day: "numeric", month: "short" }) : "" }) : t.team.notSent;
  const link = (w: string) => `/chest/team/${memberId}?week=${w}`;
  return {
    title: name,
    body: (
      <div className="page wide">
        <p><a className="button link" href="/chest/team"><Back />{t.team.title}</a></p>
        <header className="page-head">
          <div>
            <h1><Avatar name={name} photo={person.photo} size="l" />{name}</h1>
            {person.status !== "member" && person.leftAt && <p className="small muted left-on">{format(t.team.leftOn, { date: formatDate(person.leftAt, member.timeZone, locale, { day: "numeric", month: "long", year: "numeric" }) })}</p>}
          </div>
          <div className="week-total">
            <span className="label">{format(t.team.weekOf, { date: formatDay(week, locale, { day: "numeric", month: "long" }, thisYear) })}</span>
            <span className="num big">{formatDuration(total)}</span>
            <span className="small muted block">{format(t.team.ofUsual, { billable: formatDuration(billable), usual: formatDuration(caps.get(memberId) ?? 0) })}</span>
          </div>
        </header>
        <nav className="week-nav" aria-label={t.week.title}>
          <a className="button icon quiet" href={link(addDays(week, -7))} aria-label={t.week.previous} title={t.week.previous}><Back /></a>
          {week < now && <a className="button icon quiet" href={link(addDays(week, 7))} aria-label={t.week.next} title={t.week.next}><Next /></a>}
        </nav>

        <div className={`standing ${state.status}`}>
          <span className="state">{statusText}</span>
          {memberId === member.id && (state.status === "submitted" || state.status === "approved") && <span className="small muted">{t.team.yours}</span>}
          {memberId !== member.id && (state.status === "submitted" || state.status === "approved") && <Island id={`decision-${memberId}-${week}`} name="Decision" props={{ memberId, week, name, approved: state.status === "approved", t: { team: t.team, errors: t.errors } }} />}
        </div>

        {entries.length === 0 ? <EmptyState title={t.team.emptyWeek} /> : (
          <>
            <div className="grid-scroll read" tabIndex={0} role="region" aria-label={t.team.weeks}>
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col" className="row-head">{t.week.project}</th>
                    {days.map(d => <th key={d} scope="col" className="day-head"><span className="wd">{formatDay(d, locale, { weekday: "short" })}</span> <span className="dn num">{formatDay(d, locale, { day: "numeric" })}</span></th>)}
                    <th scope="col" className="sum">{t.week.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows.values()].map(r => (
                    <tr key={r.name + (r.client ?? "")}>
                      <th scope="row" className="row-head"><span className={`swatch c-${r.color}`} aria-hidden="true" /><span className="row-name"><span className="p">{r.name}</span><span className="c">{r.client ?? t.work.noClient}</span></span></th>
                      {r.cells.map((m, i) => <td key={days[i]} className="cell ro-cell num">{m ? formatDuration(m) : ""}</td>)}
                      <td className="sum num">{formatDuration(r.cells.reduce((a, b) => a + b, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="day-panel" aria-labelledby="notes-title">
              <h2 id="notes-title" className="label">{t.team.notes}</h2>
              <ul className="entries">
                {entries.map(e => (
                  <li key={e.id} className={`entry c-${e.color}`}>
                    <span className="bar" aria-hidden="true" />
                    <div>
                      <p className="entry-what"><strong>{e.projectName}</strong>{e.taskName && <span className="k"> · {e.taskName}</span>}</p>
                      <p className="entry-client">{formatDay(e.day, locale, { weekday: "long", day: "numeric", month: "short" }, thisYear)}</p>
                      {e.note && <p className="entry-note">{e.note}</p>}
                      {!e.note && e.billable && <p className="entry-note muted">{t.team.noNote}</p>}
                    </div>
                    <div className="entry-side">
                      <span className="num entry-time">{formatDuration(e.minutes)}</span>
                      {!e.billable && <StatusBadge tone="neutral" size="s" icon={false} label={t.day.notBillable} />}
                      {e.invoiced && <StatusBadge tone="ok" size="s" label={t.day.invoiced} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    ),
  };
}
