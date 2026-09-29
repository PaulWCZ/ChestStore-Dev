import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { directory } from "../../../lib/directory.ts";
import { formatDay, intl } from "../../../lib/i18n/index.ts";
import { numbers, type Count } from "../../../lib/numbers.ts";
import { listRecords } from "../../../lib/records.ts";
import { viewer } from "../../../lib/session.ts";
import { today } from "../../../lib/zone.ts";

// HR's numbers: how many people, by team, office and contract; arrivals
// and departures month by month; the turnover of the last twelve months.
// Every figure is written as a number next to its bar (never a bar alone).
export default async function NumbersPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "records.manage")) notFound();
  const sql = db();
  const now = today();
  const [{ entries }, records] = await Promise.all([directory(sql, member), listRecords(sql, member)]);
  const n = numbers(entries, records, entries.map(e => e.startDate), now);
  const fmt = new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(intl(locale), { style: "percent", maximumFractionDigits: 1 });
  const bars = (title: string, list: Count[], none: string) => (
    <section className="card-block" aria-labelledby={title}>
      <h2 id={title} className="legend">{title}</h2>
      <ul className="bars">
        {list.map(c => (
          <li key={c.label || "none"}>
            <span className="bar-label">{c.label || none}</span>
            <span className="bar-track" aria-hidden="true"><span style={{ width: `${Math.max(4, (c.count / Math.max(1, list[0]!.count)) * 100)}%` }} /></span>
            <span className="bar-value">{fmt.format(c.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  const peak = Math.max(1, ...n.months.flatMap(m => [m.arrivals, m.departures]));
  return (
    <main className="page narrow">
      <Link className="back" href="/chest/records"><Back />{t.record.back}</Link>
      <h1 className="edit-title">{t.numbers.title}</h1>
      <div className="stats">
        <div className="stat"><span className="stat-value">{fmt.format(n.headcount)}</span><span className="muted">{t.numbers.headcount}</span></div>
        <div className="stat">
          <span className="stat-value">{n.turnover === null ? "—" : pct.format(n.turnover / 100)}</span>
          <span className="muted">{t.numbers.turnover}</span>
          <span className="hint">{n.turnover === null ? t.numbers.noTurnover : t.numbers.turnoverHint}</span>
        </div>
      </div>
      <div className="grid-2 section">
        {bars(t.numbers.byTeam, n.byTeam, t.numbers.noTeam)}
        {bars(t.numbers.byOffice, n.byOffice, t.numbers.noOffice)}
        {n.byContract.length > 0 && bars(t.numbers.byContract, n.byContract.map(c => ({ label: t.record.contracts[c.contract], count: c.count })), "")}
      </div>
      <section className="card-block section" aria-labelledby="months-title">
        <h2 id="months-title" className="legend">{t.numbers.months}</h2>
        <p className="hint">{n.fromRecords ? t.numbers.monthsHint : t.numbers.monthsFromProfiles}</p>
        <div className="table-frame">
          <table className="plan months">
            <thead>
              <tr>
                <th scope="col">{t.numbers.month}</th>
                <th scope="col"><span className="key in" aria-hidden="true" />{t.numbers.arrivals}</th>
                {n.fromRecords && <th scope="col"><span className="key out" aria-hidden="true" />{t.numbers.departures}</th>}
              </tr>
            </thead>
            <tbody>
              {n.months.map(m => (
                <tr key={m.month}>
                  <th scope="row">{formatDay(m.month + "-01", locale, { month: "short", year: "numeric" })}</th>
                  <td><span className="cell-bar"><span className="mini-bar in" style={{ width: `${(m.arrivals / peak) * 100}%` }} /><span className="bar-value">{fmt.format(m.arrivals)}</span></span></td>
                  {n.fromRecords && <td><span className="cell-bar"><span className="mini-bar out" style={{ width: `${(m.departures / peak) * 100}%` }} /><span className="bar-value">{fmt.format(m.departures)}</span></span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
