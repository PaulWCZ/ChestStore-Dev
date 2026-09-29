import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate, plural } from "../../../lib/i18n/index.ts";
import { waitedFor } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { report, reportWeeks } from "../../../lib/reports.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/tickets.ts";

// What a support lead is asked every week, for the administrators: how
// many requests, how fast the team first answered, who answered, which
// subjects, what customers thought. Numbers and tables, nothing to learn.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "reports")) notFound();
  const sql = db();
  const s = await settings(sql);
  const weeks = (reportWeeks as readonly number[]).includes(Number((await searchParams).weeks)) ? Number((await searchParams).weeks) : 8;
  const r = await report(sql, member, { weeks, hours: s.hours, timeZone: chest.timeZone(), lateHours: s.lateHours });
  const who = await people(r.agents.map(a => a.id));
  const w = t.reports;
  const duration = (minutes: number | null) => {
    if (minutes === null) return w.none;
    const d = waitedFor(minutes);
    return d.unit === "day" ? plural(w.duration.day, d.count, locale) : format(w.duration[d.unit], { count: d.count });
  };
  const number = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale).format(n);
  return (
    <div className="boxes wide">
      <div className="page-head">
        <h1>{w.title}</h1>
        <nav className="periods" aria-label={w.period}>
          {reportWeeks.map(n => <Link key={n} href={`/chest/reports?weeks=${n}`} aria-current={n === weeks ? "page" : undefined}>{plural(w.weeks, n, locale)}</Link>)}
        </nav>
      </div>
      {r.total.created === 0 && r.total.closed === 0 ? <div className="empty"><p>{w.empty}</p></div> : (
        <>
          <dl className="figures">
            <div><dt>{w.created}</dt><dd>{number(r.total.created)}</dd></div>
            <div><dt>{w.closed}</dt><dd>{number(r.total.closed)}</dd></div>
            <div><dt>{w.open}</dt><dd>{number(r.total.open)}</dd></div>
            <div><dt>{w.medianFirst}</dt><dd>{duration(r.total.medianFirst)}</dd></div>
            {r.total.withinTarget !== null && <div><dt>{format(w.withinTarget, { hours: s.lateHours })}</dt><dd>{r.total.withinTarget} %</dd></div>}
            {r.total.good + r.total.bad > 0 && <div><dt>{w.satisfaction}</dt><dd className="small">{format(w.satisfactionValue, { good: number(r.total.good), bad: number(r.total.bad) })}</dd></div>}
          </dl>
          <p className="hint">{w.medianHint}</p>
          <section className="box">
            <h2>{w.perWeek}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">{w.week}</th><th scope="col" className="num">{w.created}</th><th scope="col" className="num">{w.closed}</th><th scope="col" className="num">{w.medianFirst}</th></tr></thead>
                <tbody>{r.weeks.map(x => <tr key={x.start}><th scope="row">{formatDate(x.start + "T12:00:00Z", locale, { day: "numeric", month: "short" })}</th><td className="num">{number(x.created)}</td><td className="num">{number(x.closed)}</td><td className="num">{duration(x.medianFirst)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
          {r.agents.length > 0 && (
            <section className="box">
              <h2>{w.perAgent}</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th scope="col">{w.person}</th><th scope="col" className="num">{w.replies}</th><th scope="col" className="num">{w.closed}</th><th scope="col" className="num">{w.medianFirst}</th></tr></thead>
                  <tbody>{r.agents.map(a => <tr key={a.id}><th scope="row">{nameOf(who.get(a.id), locale)}</th><td className="num">{number(a.replies)}</td><td className="num">{number(a.closed)}</td><td className="num">{duration(a.medianFirst)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          <div className="two">
            {r.tags.length > 0 && (
              <section className="box">
                <h2>{w.perTag}</h2>
                <table>
                  <thead><tr><th scope="col">{w.tag}</th><th scope="col" className="num">{w.created}</th><th scope="col" className="num">{w.stillOpen}</th></tr></thead>
                  <tbody>{r.tags.map(g => <tr key={g.name}><th scope="row">{g.name}</th><td className="num">{number(g.created)}</td><td className="num">{number(g.open)}</td></tr>)}</tbody>
                </table>
              </section>
            )}
            <section className="box">
              <h2>{w.perChannel}</h2>
              <table>
                <thead><tr><th scope="col">{w.channel}</th><th scope="col" className="num">{w.created}</th></tr></thead>
                <tbody>{r.channels.map(c => <tr key={c.channel}><th scope="row">{t.ticket.channel[c.channel as "form"]}</th><td className="num">{number(c.created)}</td></tr>)}</tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
