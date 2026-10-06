import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { formatDay, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { directory } from "../lib/directory.ts";
import { numbers, workersOf, type Count } from "../lib/numbers.ts";
import { listRecords } from "../lib/records.ts";
import { today } from "../lib/zone.ts";
import { numberFormat } from "../shared/format.ts";
import { percent } from "../shared/model.ts";
import { BackLink } from "./parts.tsx";

// HR's numbers: how many people, by team, office and contract; arrivals
// and departures month by month; the turnover of the last twelve months.
// Every figure is written as a number next to its bar (never a bar alone);
// a bar's length is a class (pct-0…pct-100), never a style attribute.
export async function numbersPage({ member, locale, t }: PageContext): Promise<View> {
  if (!can(member, "records.manage")) return notFound();
  const sql = db();
  const now = today();
  const [{ entries }, records] = await Promise.all([directory(sql, member), listRecords(sql, member)]);
  // One population for every figure (lib/numbers.ts): the records of
  // people here, and the directory's members without a record.
  const workers = workersOf(records.filter(r => !r.erased), entries);
  const n = numbers(workers, now);
  const gone = workers.filter(w => w.gone).length;
  const fmt = numberFormat(locale, { maximumFractionDigits: 1 });
  const pct = numberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const bars = (title: string, list: Count[], none: string) => (
    <section className="card-block" aria-labelledby={title}>
      <h2 id={title} className="legend">{title}</h2>
      <ul className="bars">
        {list.map(c => (
          <li key={c.label || "none"}>
            <span className="bar-label">{c.label || none}</span>
            <span className="bar-track" aria-hidden="true"><span className={`pct-${Math.max(4, percent(c.count, Math.max(1, list[0]!.count)))}`} /></span>
            <span className="bar-value">{fmt.format(c.count)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  const peak = Math.max(1, ...n.months.flatMap(m => [m.arrivals, m.departures]));
  return {
    title: t.numbers.title,
    body: (
      <div className="page narrow">
        <BackLink href="/chest/records">{t.record.back}</BackLink>
        <h1 className="edit-title">{t.numbers.title}</h1>
        <div className="stats">
          <div className="stat"><span className="stat-value">{fmt.format(n.headcount)}</span><span className="muted">{t.numbers.headcount}</span><span className="hint">{t.numbers.population}</span></div>
          <div className="stat">
            <span className="stat-value">{n.turnover === null ? "—" : pct.format(n.turnover / 100)}</span>
            <span className="muted">{t.numbers.turnover}</span>
            <span className="hint">{n.turnover === null ? t.numbers.noTurnover : t.numbers.turnoverHint}</span>
          </div>
        </div>
        {gone > 0 && <p className="banner warn"><a href="/chest/records/register#gaps-title">{plural(t.numbers.gone, gone, locale)}</a></p>}
        <div className="grid-2 section">
          {bars(t.numbers.byTeam, n.byTeam, t.numbers.noTeam)}
          {bars(t.numbers.byOffice, n.byOffice, t.numbers.noOffice)}
          {n.byContract.length > 0 && bars(t.numbers.byContract, n.byContract.map(c => ({ label: c.contract ? t.record.contracts[c.contract] : t.numbers.noRecord, count: c.count })), "")}
        </div>
        <section className="card-block section" aria-labelledby="months-title">
          <h2 id="months-title" className="legend">{t.numbers.months}</h2>
          <p className="hint">{n.fromRecords ? t.numbers.monthsHint : t.numbers.monthsFromProfiles}</p>
          <Island name="MonthsTable" props={{
            caption: t.numbers.months, departures: n.fromRecords, labels: t.tables,
            heads: { month: t.numbers.month, arrivals: t.numbers.arrivals, departures: t.numbers.departures },
            rows: n.months.map(m => ({ month: m.month, label: formatDay(m.month + "-01", locale, { month: "short", year: "numeric" }), arrivalsText: fmt.format(m.arrivals), departuresText: fmt.format(m.departures), arrivalsPct: percent(m.arrivals, peak), departuresPct: percent(m.departures, peak) })),
          }} />
        </section>
      </div>
    ),
  };
}
