import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back, Next } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { today, zone } from "../../../../lib/clock.ts";
import { db } from "../../../../lib/db.ts";
import { addDays, isDay, mondayOf, weekDays } from "../../../../lib/days.ts";
import { formatDuration } from "../../../../lib/duration.ts";
import { format, formatDate, formatDay } from "../../../../lib/i18n/index.ts";
import { memberPattern } from "../../../../lib/model.ts";
import { nameFor, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { capacities, personWeek } from "../../../../lib/weeks.ts";
import { Decision } from "../team-view.tsx";

// One person's week, as a manager reads it before approving: hours per
// project and day, every entry with its note; approve or send back.
export default async function PersonWeekPage({ params, searchParams }: { params: Promise<{ member: string }>; searchParams: Promise<{ week?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "approve")) forbidden();
  const { member: memberId } = await params;
  if (!memberPattern.test(memberId)) notFound();
  const q = await searchParams;
  const now = mondayOf(today());
  const week = isDay(q.week) ? mondayOf(q.week) : addDays(now, -7);
  const sql = db();
  const [{ state, entries }, who, caps] = await Promise.all([personWeek(sql, member, memberId, week), people([memberId]), capacities(sql, [memberId])]);
  const person = who.get(memberId);
  if (!person || person.status === "unknown") notFound();
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
  const statusText = state.status === "approved" ? format(t.week.approvedBy, { name: decider, date: state.decidedAt ? formatDate(state.decidedAt, zone(), locale, { day: "numeric", month: "short" }) : "" })
    : state.status === "returned" ? `${format(t.week.returnedBy, { name: decider })} “${state.reason}”`
    : state.status === "submitted" ? t.team.states.sent : t.team.notSent;
  const link = (w: string) => `/chest/team/${memberId}?week=${w}`;
  return (
    <main className="page wide">
      <p><Link className="button link" href="/chest/team"><Back />{t.team.title}</Link></p>
      <header className="page-head">
        <h1><Avatar name={name} photo={person.photo} size={40} />{name}</h1>
        <div className="week-total">
          <span className="label">{format(t.team.weekOf, { date: formatDay(week, locale, { day: "numeric", month: "long" }) })}</span>
          <span className="num big">{formatDuration(total)}</span>
          <span className="small muted block">{format(t.team.ofUsual, { billable: formatDuration(billable), usual: formatDuration(caps.get(memberId) ?? 0) })}</span>
        </div>
      </header>
      <nav className="week-nav" aria-label={t.week.title}>
        <Link className="button icon quiet" href={link(addDays(week, -7))} aria-label={t.week.previous} title={t.week.previous}><Back /></Link>
        {week < now && <Link className="button icon quiet" href={link(addDays(week, 7))} aria-label={t.week.next} title={t.week.next}><Next /></Link>}
      </nav>

      <div className={`standing ${state.status}`}>
        <span className="state">{statusText}</span>
        {(state.status === "submitted" || state.status === "approved") && <Decision memberId={memberId} week={week} name={name} approved={state.status === "approved"} t={{ team: t.team, errors: t.errors }} />}
      </div>

      {entries.length === 0 ? <div className="empty"><p>{t.team.emptyWeek}</p></div> : (
        <>
          <div className="grid-scroll read">
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
                  <div className="entry-main">
                    <p className="entry-what"><strong>{e.projectName}</strong>{e.taskName && <span className="k"> · {e.taskName}</span>}</p>
                    <p className="entry-client">{formatDay(e.day, locale, { weekday: "long", day: "numeric", month: "short" })}</p>
                    {e.note && <p className="entry-note">{e.note}</p>}
                    {!e.note && e.billable && <p className="entry-note muted">{t.team.noNote}</p>}
                  </div>
                  <div className="entry-side">
                    <span className="num entry-time">{formatDuration(e.minutes)}</span>
                    {!e.billable && <span className="tag">{t.day.notBillable}</span>}
                    {e.invoiced && <span className="tag">{t.day.invoiced}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
