import { chest } from "@argentic/chest-sdk/chest";
import { Island, notFound, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import type { Cell } from "../islands/ReportTable.tsx";
import { format, formatDate, number as count, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { waitedFor } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { report, reportWeeks } from "../lib/reports.ts";
import { settings } from "../lib/tickets.ts";

// What a support lead is asked every week, /chest/reports, for the
// administrators: how many requests, how fast the team first answered, who
// answered, which subjects, what customers thought. Numbers and tables,
// nothing to learn.
export async function reportsPage({ sql, member, lang: locale, t, query }: TeamContext): Promise<View> {
  if (!can(member, "reports")) notFound();
  const s = await settings(sql);
  const asked = Number(query("weeks"));
  const weeks = (reportWeeks as readonly number[]).includes(asked) ? asked : 8;
  const zone = chest.timeZone;
  const r = await report(sql, member, { weeks, hours: s.hours, timeZone: zone, lateHours: s.lateHours });
  const who = await people(r.agents.map(a => a.id));
  const w = t.reports;
  const duration = (minutes: number | null): string => {
    if (minutes === null) return w.none;
    const d = waitedFor(minutes);
    return d.unit === "day" ? plural(w.duration.day, d.count, locale) : format(w.duration[d.unit], { count: d.count });
  };
  const n = (value: number) => count(value, locale);
  const cell = (value: number): Cell => ({ text: n(value), sort: value });
  const time = (m: number | null): Cell => ({ text: duration(m), sort: m });
  return {
    title: w.title,
    body: (
      <div className="boxes wide">
        <PageHeader size="m" title={w.title} action={<Island name="PeriodTabs" props={{ label: w.period, current: String(weeks), items: reportWeeks.map(x => ({ id: String(x), label: plural(w.weeks, x, locale), href: `/chest/reports?weeks=${x}` })) }} />} />
        {r.total.created === 0 && r.total.closed === 0 ? <EmptyState title={w.empty} /> : (
          <>
            <dl className="figures">
              <div><dt>{w.created}</dt><dd>{n(r.total.created)}</dd></div>
              <div><dt>{w.closed}</dt><dd>{n(r.total.closed)}</dd></div>
              <div><dt>{w.open}</dt><dd>{n(r.total.open)}</dd></div>
              <div><dt>{w.medianFirst}</dt><dd>{duration(r.total.medianFirst)}</dd></div>
              {r.total.withinTarget !== null && <div><dt>{format(w.withinTarget, { hours: s.lateHours })}</dt><dd>{format(w.percent, { value: r.total.withinTarget })}</dd></div>}
              {r.total.good + r.total.bad > 0 && <div><dt>{w.satisfaction}</dt><dd className="small">{format(w.satisfactionValue, { good: n(r.total.good), bad: n(r.total.bad) })}</dd></div>}
            </dl>
            <p className="hint">{w.medianHint}</p>
            <section className="box">
              <h2>{w.perWeek}</h2>
              <Island name="ReportTable" props={{ caption: w.perWeek, labels: t.kit.table,
                columns: [{ key: "week", label: w.week }, { key: "created", label: w.created, number: true }, { key: "closed", label: w.closed, number: true }, { key: "median", label: w.medianFirst, number: true }],
                rows: r.weeks.map(x => ({ key: x.start, cells: { week: { text: formatDate(x.start + "T12:00:00Z", locale, "UTC", { day: "numeric", month: "short" }), sort: x.start }, created: cell(x.created), closed: cell(x.closed), median: time(x.medianFirst) } })) }} />
            </section>
            {r.agents.length > 0 && (
              <section className="box">
                <h2>{w.perAgent}</h2>
                <Island name="ReportTable" props={{ caption: w.perAgent, labels: t.kit.table,
                  columns: [{ key: "person", label: w.person }, { key: "replies", label: w.replies, number: true }, { key: "closed", label: w.closed, number: true }, { key: "median", label: w.medianFirst, number: true }],
                  rows: r.agents.map(a => { const name = nameOf(who.get(a.id), locale); return { key: a.id, cells: { person: { text: name, sort: name }, replies: cell(a.replies), closed: cell(a.closed), median: time(a.medianFirst) } }; }) }} />
              </section>
            )}
            <div className="two">
              {r.tags.length > 0 && (
                <section className="box">
                  <h2>{w.perTag}</h2>
                  <Island name="ReportTable" props={{ caption: w.perTag, labels: t.kit.table,
                    columns: [{ key: "tag", label: w.tag }, { key: "created", label: w.created, number: true }, { key: "open", label: w.stillOpen, number: true }],
                    rows: r.tags.map(g => ({ key: g.name, cells: { tag: { text: g.name, sort: g.name }, created: cell(g.created), open: cell(g.open) } })) }} />
                </section>
              )}
              <section className="box">
                <h2>{w.perChannel}</h2>
                <Island name="ReportTable" props={{ caption: w.perChannel, labels: t.kit.table,
                  columns: [{ key: "channel", label: w.channel }, { key: "created", label: w.created, number: true }],
                  rows: r.channels.map(c => { const name = t.ticket.channel[c.channel as "form"] ?? c.channel; return { key: c.channel, cells: { channel: { text: name, sort: name }, created: cell(c.created) } }; }) }} />
              </section>
            </div>
          </>
        )}
      </div>
    ),
  };
}
