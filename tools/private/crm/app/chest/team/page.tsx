import { EmptyState } from "@argentic/chest-ui/components";
import { db } from "../../../lib/db.ts";
import { format, formatDay, money, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { directory } from "../../../lib/people.ts";
import { teamReport } from "../../../lib/reports.ts";
import { viewer } from "../../../lib/session.ts";
import { PipelineTable, ResultsTable } from "./tables.tsx";

// The team's numbers, for the manager's weekly look: each person's open
// pipeline and the next steps that slip; won and lost, month by month;
// what should close, by expected month; why deals are lost. Plain tables
// with a bar beside the figure — nothing to configure.
export default async function Team() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const now = today();
  const r = await teamReport(sql, member, now);
  const ids = [...new Set([...r.owners.map(o => o.owner), ...r.results.map(x => x.owner)])];
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
