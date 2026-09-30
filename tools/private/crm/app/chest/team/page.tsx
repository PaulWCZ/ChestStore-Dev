import { EmptyState, Segmented } from "@argentic/chest-ui/components";
import { Link } from "../../../components/link.tsx";
import { db } from "../../../lib/db.ts";
import { format, formatDay, money, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/zone.ts";
import { directory } from "../../../lib/people.ts";
import { stageConversion, teamReport, weekActivities } from "../../../lib/reports.ts";
import { stageWords } from "../../../lib/page-data.ts";
import { viewer } from "../../../lib/session.ts";
import { ActivityTable, PipelineTable, ResultsTable } from "./tables.tsx";

// The team's numbers, for the manager's weekly look: each person's open
// pipeline and the next steps that slip; won and lost, month by month;
// what should close, by expected month; why deals are lost. Plain tables
// with a bar beside the figure — nothing to configure.
export default async function Team({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const now = today();
  // The Monday numbers: what each person logged in a week (this one or one
  // of the three before), and how deals go from stage to stage.
  const back = Math.min(3, Math.max(0, Number.parseInt((await searchParams).week ?? "0", 10) || 0));
  const [r, week, conversion, { names: stageNames }] = await Promise.all([teamReport(sql, member, now), weekActivities(sql, member, now, back), stageConversion(sql, member), stageWords(sql, t)]);
  const ids = [...new Set([...r.owners.map(o => o.owner), ...r.results.map(x => x.owner), ...week.lines.map(l => l.author)])];
  const names = await directory(ids, locale);
  const who = (id: string | null) => (id === null ? t.common.unassigned : names[id]?.name ?? t.people.unknown);
  const month = (m: string) => formatDay(m + "-01", locale, { month: "short", year: "2-digit" });
  const w = t.team;
  const empty = r.owners.length === 0 && r.results.length === 0;
  const totals = r.owners.reduce((a, o) => ({ open: a.open + o.open, value: a.value + o.value, weighted: a.weighted + o.weighted, noStep: a.noStep + o.noStep, late: a.late + o.late }), { open: 0, value: 0, weighted: 0, noStep: 0, late: 0 });
  const maxValue = Math.max(1, ...r.owners.map(o => o.value));
  const byMonth = r.months.map(m => {
    const lines = r.results.filter(x => x.month === m);
    return { month: m, won: lines.reduce((n, x) => n + x.won, 0), wonValue: lines.reduce((n, x) => n + x.wonValue, 0), lost: lines.reduce((n, x) => n + x.lost, 0) };
  });
  const maxMonth = Math.max(1, ...byMonth.map(m => m.wonValue));
  const people = [...new Set(r.results.map(x => x.owner))];
  const maxClose = Math.max(1, ...r.closing.map(c => c.value));
  const maxReason = Math.max(1, ...r.reasons.map(x => x.count));
  const closeName = (m: string) => (m === "late" ? w.closingLate : m === "later" ? w.closingLater : m === "none" ? w.closingNone : month(m));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{w.title}</h1>
          <p className="lede">{w.lede}</p>
        </div>
      </div>
      {empty ? <div className="empty-box"><EmptyState title={w.empty} /></div> : (
        <div className="report">
          <section className="panel" aria-labelledby="r-pipeline">
            <h2 id="r-pipeline" className="label-mono">{w.pipeline}</h2>
            <PipelineTable
              labels={t.table}
              words={{ caption: w.pipeline, person: w.person, open: w.open, value: w.value, weighted: w.weighted, noStep: w.noStep, late: w.late, total: w.total }}
              rows={r.owners.map(o => ({ key: o.owner ?? "none", href: `/chest/deals?view=list&owner=${o.owner ?? "none"}`, name: who(o.owner), open: o.open, value: o.value, valueText: money(o.value, locale), share: Math.round((o.value / maxValue) * 100), weightedText: money(o.weighted, locale), noStep: o.noStep, late: o.late }))}
              totals={{ open: String(totals.open), value: money(totals.value, locale), weighted: money(totals.weighted, locale), noStep: String(totals.noStep), late: String(totals.late) }}
            />
          </section>

          <section className="panel" aria-labelledby="r-week">
            <h2 id="r-week" className="label-mono">{w.week}</h2>
            <div className="week-pick">
              <Segmented label={w.weeks} value={String(back)} link={Link}
                options={[0, 1, 2, 3].map(n => ({ value: String(n), label: n === 0 ? w.thisWeek : n === 1 ? w.lastWeek : format(w.weeksAgo, { count: n }), href: n === 0 ? "/chest/team" : `/chest/team?week=${n}` }))} />
            </div>
            <p className="muted small-text">{format(w.weekOf, { day: formatDay(week.from, locale, { weekday: "long", day: "numeric", month: "long" }) })}</p>
            {week.lines.length === 0 ? <p className="muted">{w.noActivity}</p> : (
              <ActivityTable
                labels={t.table}
                words={{ caption: w.week, person: w.person, calls: w.calls, meetings: w.meetings, emails: w.emails, notes: w.notes, logged: w.logged }}
                rows={week.lines.map(l => ({ key: l.author, name: who(l.author), call: l.call, meeting: l.meeting, email: l.email, note: l.note, total: l.total }))}
              />
            )}
          </section>

          <section className="panel" aria-labelledby="r-conversion">
            <h2 id="r-conversion" className="label-mono">{w.conversion}</h2>
            {conversion.deals === 0 ? <p className="muted">{w.conversionEmpty}</p> : (
              <ul className="bars">
                {[...conversion.stages.map(s => ({ key: s.stageId, name: stageNames[s.stageId] ?? "", reached: s.reached })), { key: "won", name: w.won, reached: conversion.won }].map((s, i, all) => {
                  const next = all[i + 1];
                  const rate = next && s.reached > 0 ? `${Math.round((next.reached / s.reached) * 100)} %` : null;
                  return (
                    <li key={s.key}>
                      <span className="bar-row">
                        <span className="bar-label">{s.name}</span>
                        <span className="bar-track" aria-hidden="true"><span className={`bar-fill${s.key === "won" ? " won" : ""}`} style={{ width: `${Math.round((s.reached / Math.max(1, conversion.deals)) * 100)}%` }} /></span>
                        <span className="bar-value num">{s.key === "won" ? plural(w.deals, s.reached, locale) : plural(w.reached, s.reached, locale)}{rate ? ` · ${format(w.wentOn, { rate })}` : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="r-results">
            <h2 id="r-results" className="label-mono">{w.results}</h2>
            <ol className="month-bars">
              {byMonth.map(m => (
                <li key={m.month} aria-label={format(w.chartLabel, { month: month(m.month), won: money(m.wonValue, locale), lost: m.lost })}>
                  <span className="month-bar" aria-hidden="true"><span className="bar-fill won" style={{ height: `${Math.round((m.wonValue / maxMonth) * 100)}%` }} /></span>
                  <span className="num small-text">{m.wonValue > 0 ? money(m.wonValue, locale, { compact: true }) : "—"}</span>
                  <span className="label-mono">{month(m.month)}</span>
                </li>
              ))}
            </ol>
            {people.length > 0 && (
              <ResultsTable
                labels={t.table}
                words={{ caption: w.results, person: w.person, winRate: w.winRate }}
                months={r.months.map(month)}
                rows={people.map(p => {
                  const lines = r.results.filter(x => x.owner === p);
                  const won = lines.reduce((n, x) => n + x.won, 0), lost = lines.reduce((n, x) => n + x.lost, 0);
                  return {
                    key: p ?? "none",
                    name: who(p),
                    months: r.months.map(m => {
                      const x = lines.find(l => l.month === m);
                      return x ? { won: x.won > 0 ? money(x.wonValue, locale, { compact: true }) : null, count: `${x.won}/${x.won + x.lost}` } : null;
                    }),
                    rate: won + lost > 0 ? `${Math.round((won / (won + lost)) * 100)} %` : "—",
                  };
                })}
              />
            )}
          </section>

          <div className="report-pair">
            <section className="panel" aria-labelledby="r-closing">
              <h2 id="r-closing" className="label-mono">{w.closing}</h2>
              <ul className="bars">
                {r.closing.map(c => (
                  <li key={c.month}>
                    <span className="bar-row">
                      <span className={`bar-label${c.month === "late" && c.count > 0 ? " late-text" : ""}`}>{closeName(c.month)}</span>
                      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.round((c.value / maxClose) * 100)}%` }} /></span>
                      <span className="bar-value num">{c.count > 0 ? `${plural(w.deals, c.count, locale)} · ${money(c.value, locale, { compact: true })}` : "—"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel" aria-labelledby="r-reasons">
              <h2 id="r-reasons" className="label-mono">{w.reasons}</h2>
              {r.reasons.length === 0 ? <p className="muted">—</p> : (
                <ul className="bars">
                  {r.reasons.map(x => (
                    <li key={x.reason}>
                      <span className="bar-row">
                        <span className="bar-label">{x.reason || w.noReason}</span>
                        <span className="bar-track" aria-hidden="true"><span className="bar-fill lost" style={{ width: `${Math.round((x.count / maxReason) * 100)}%` }} /></span>
                        <span className="bar-value num">{plural(w.deals, x.count, locale)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
