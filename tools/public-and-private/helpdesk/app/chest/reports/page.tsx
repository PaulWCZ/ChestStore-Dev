import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate, plural } from "../../../lib/i18n/index.ts";
import { waitedFor } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { report, reportWeeks } from "../../../lib/reports.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/tickets.ts";
import { PeriodTabs } from "./period-tabs.tsx";
import { ReportTable, type Cell } from "../../../components/report-table.tsx";

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
  const duration = (minutes: number | null): string => {
    if (minutes === null) return w.none;
    const d = waitedFor(minutes);
    return d.unit === "day" ? plural(w.duration.day, d.count, locale) : format(w.duration[d.unit], { count: d.count });
  };
  const number = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale).format(n);
  const count = (n: number): Cell => ({ text: number(n), sort: n });
  const time = (m: number | null): Cell => ({ text: duration(m), sort: m });
  return (
    <div className="boxes wide">
      <PageHeader size="m" title={w.title} action={<PeriodTabs label={w.period} current={String(weeks)} items={reportWeeks.map(n => ({ id: String(n), label: plural(w.weeks, n, locale), href: `/chest/reports?weeks=${n}` }))} />} />
      {r.total.created === 0 && r.total.closed === 0 ? <EmptyState title={w.empty} /> : (
        <>
          <dl className="figures">
            <div><dt>{w.created}</dt><dd>{number(r.total.created)}</dd></div>
            <div><dt>{w.closed}</dt><dd>{number(r.total.closed)}</dd></div>
            <div><dt>{w.open}</dt><dd>{number(r.total.open)}</dd></div>
            <div><dt>{w.medianFirst}</dt><dd>{duration(r.total.medianFirst)}</dd></div>
            {r.total.withinTarget !== null && <div><dt>{format(w.withinTarget, { hours: s.lateHours })}</dt><dd>{format(w.percent, { value: r.total.withinTarget })}</dd></div>}
            {r.total.good + r.total.bad > 0 && <div><dt>{w.satisfaction}</dt><dd className="small">{format(w.satisfactionValue, { good: number(r.total.good), bad: number(r.total.bad) })}</dd></div>}
          </dl>
          <p className="hint">{w.medianHint}</p>
          <section className="box">
            <h2>{w.perWeek}</h2>
            <ReportTable caption={w.perWeek} labels={t.table}
              columns={[{ key: "week", label: w.week }, { key: "created", label: w.created, number: true }, { key: "closed", label: w.closed, number: true }, { key: "median", label: w.medianFirst, number: true }]}
              rows={r.weeks.map(x => ({ key: x.start, cells: { week: { text: formatDate(x.start + "T12:00:00Z", locale, { day: "numeric", month: "short" }), sort: x.start }, created: count(x.created), closed: count(x.closed), median: time(x.medianFirst) } }))} />
          </section>
          {r.agents.length > 0 && (
            <section className="box">
              <h2>{w.perAgent}</h2>
              <ReportTable caption={w.perAgent} labels={t.table}
                columns={[{ key: "person", label: w.person }, { key: "replies", label: w.replies, number: true }, { key: "closed", label: w.closed, number: true }, { key: "median", label: w.medianFirst, number: true }]}
                rows={r.agents.map(a => { const name = nameOf(who.get(a.id), locale); return { key: a.id, cells: { person: { text: name, sort: name }, replies: count(a.replies), closed: count(a.closed), median: time(a.medianFirst) } }; })} />
            </section>
          )}
          <div className="two">
            {r.tags.length > 0 && (
              <section className="box">
                <h2>{w.perTag}</h2>
                <ReportTable caption={w.perTag} labels={t.table}
                  columns={[{ key: "tag", label: w.tag }, { key: "created", label: w.created, number: true }, { key: "open", label: w.stillOpen, number: true }]}
                  rows={r.tags.map(g => ({ key: g.name, cells: { tag: { text: g.name, sort: g.name }, created: count(g.created), open: count(g.open) } }))} />
              </section>
            )}
            <section className="box">
              <h2>{w.perChannel}</h2>
              <ReportTable caption={w.perChannel} labels={t.table}
                columns={[{ key: "channel", label: w.channel }, { key: "created", label: w.created, number: true }]}
                rows={r.channels.map(c => { const name = t.ticket.channel[c.channel as "form"] ?? c.channel; return { key: c.channel, cells: { channel: { text: name, sort: name }, created: count(c.created) } }; })} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
