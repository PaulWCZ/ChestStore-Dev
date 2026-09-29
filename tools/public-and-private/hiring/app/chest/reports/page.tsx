import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { format, formatDate, plural, type Catalogue } from "../../../lib/i18n/index.ts";
import { report, type Report } from "../../../lib/reports.ts";
import { viewer } from "../../../lib/session.ts";
import { stageLabel } from "../../../lib/stages.ts";

// How hiring goes: for every job, or one — counts only (no person is
// scored here): where candidates come from, how far they get, why they
// stop, how long a hire takes, applications per month.
export default async function Reports({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const v = await viewer();
  if (!v || !can(v.member, "export")) notFound();
  const { job } = await searchParams;
  const { t, locale, member } = v;
  const sql = db();
  const jobs = await sql<{ id: string; title: string; state: string }[]>`select id, title, state from jobs where state != 'draft' order by (state = 'open') desc, coalesce(opened_at, created_at) desc limit 100`;
  let r: Report;
  try {
    r = await report(sql, member, job);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const w = t.reports;
  const current = jobs.find(j => String(j.id) === job);
  const max = (list: { count?: number; reached?: number }[]) => Math.max(1, ...list.map(x => x.count ?? x.reached ?? 0));
  return (
    <div className="reports">
      <div className="page-head"><h1>{current ? format(w.titleJob, { job: current.title }) : w.title}</h1></div>
      <nav className="report-jobs" aria-label={w.pick}>
        <Link href="/chest/reports" aria-current={!current ? "page" : undefined}>{w.all}</Link>
        {jobs.map(j => <Link key={j.id} href={`/chest/reports?job=${j.id}`} aria-current={current?.id === j.id ? "page" : undefined}>{j.title}</Link>)}
      </nav>
      <div className="report-tiles">
        <Tile n={r.total} label={plural(w.applications, r.total, locale)} />
        <Tile n={r.active} label={w.inProgress} />
        <Tile n={r.hired} label={plural(w.hired, r.hired, locale)} />
        <Tile n={r.daysToHire} label={r.daysToHire === null ? w.noHire : plural(w.daysToHire, r.daysToHire, locale)} />
      </div>
      <div className="report-grid">
        <Bars title={w.perMonth} rows={r.months.map(m => ({ label: formatDate(m.month + "-15T12:00:00Z", locale, { month: "short", year: "2-digit" }), value: m.count }))} max={max(r.months)} />
        <Bars title={w.sources} rows={r.sources.map(s => ({ label: t.candidate.source[s.source as keyof Catalogue["candidate"]["source"]] ?? s.source, value: s.count }))} max={max(r.sources)} empty={w.nothing} />
        {current && <Bars title={w.funnel} hint={w.funnelHint} rows={r.funnel.map(f => ({ label: stageLabel(f, t.jobSettings.defaults), value: f.reached }))} max={max(r.funnel)} />}
        <Bars title={w.reasons} rows={r.reasons.map(x => ({ label: t.reject.reasons[x.reason], value: x.count }))} max={max(r.reasons)} empty={w.nothing} />
      </div>
    </div>
  );
}

function Tile({ n, label }: { n: number | null; label: string }) {
  return <div className="tile"><span className="tile-n">{n ?? "–"}</span><span className="tile-label">{label}</span></div>;
}

function Bars({ title, hint, rows, max, empty }: { title: string; hint?: string; rows: { label: string; value: number }[]; max: number; empty?: string }) {
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      {hint && <p className="hint tight-top">{hint}</p>}
      {rows.length === 0 ? <p className="muted">{empty}</p> : (
        <dl className="bars">
          {rows.map((row, i) => (
            <div key={i}>
              <dt>{row.label}</dt>
              <dd><span className="bar" style={{ width: `${Math.round((row.value / max) * 100)}%` }} /><span className="bar-n">{row.value}</span></dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
