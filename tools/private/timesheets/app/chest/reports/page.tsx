import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { AutoSubmit } from "../../../components/auto-submit.tsx";
import { Download, Note } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { currency, today } from "../../../lib/clock.ts";
import { db } from "../../../lib/db.ts";
import { formatDuration, hours as decimalHours } from "../../../lib/duration.ts";
import { decimal, format, formatDay, money, percent, plural } from "../../../lib/i18n/index.ts";
import { nameFor, people } from "../../../lib/people.ts";
import { period, presets } from "../../../lib/periods.ts";
import { billableFilters, groups, isGroup, report, reportPeople, type Line } from "../../../lib/reports.ts";
import { viewer } from "../../../lib/session.ts";
import { settings } from "../../../lib/settings.ts";
import { MarkInvoiced } from "./mark-invoiced.tsx";
import { GroupChoice, LinesTable, RangeFields, type LineRow } from "./report-views.tsx";

type Query = { preset?: string; from?: string; to?: string; group?: string; person?: string; kind?: string };

// Where the time went: a period, totals, a bar per day, a line per project
// (client, person, task), and the CSV. A member sees their own time only;
// managers also see amounts, costs and margins, and mark billable time
// invoiced. Hours are written as the company chose (4:05 or 4.08).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const q = await searchParams;
  const all = can(member, "reports.all");
  const p = period(q.preset, today(), q.from, q.to);
  const group = isGroup(q.group) ? q.group : "project";
  const kinds = billableFilters.filter(k => all || k !== "uninvoiced");
  const kind = (kinds as readonly string[]).includes(q.kind ?? "") ? q.kind! : "all";
  const person = all && q.person ? q.person : "";
  const sql = db();
  const [r, candidates, s] = await Promise.all([
    report(sql, member, { from: p.from, to: p.to, group, person: person || undefined, billable: kind }),
    all ? reportPeople(sql, member) : Promise.resolve([]),
    settings(sql),
  ]);
  const h = (minutes: number) => (s.hoursStyle === "decimal" ? decimal(decimalHours(minutes), locale) : formatDuration(minutes));
  const who = await people([...candidates, ...r.lines.flatMap(l => (l.memberId ? [l.memberId] : []))]);
  const code = currency();
  const showMoney = all && r.priced;
  const showCost = all && r.costed;
  const margin = (cents: number, cost: number) => (cents ? format(t.reports.marginOf, { amount: money(cents - cost, code, locale), percent: percent((cents - cost) / cents, locale) }) : money(cents - cost, code, locale));
  const params = new URLSearchParams({ preset: p.preset, from: p.from, to: p.to, group, kind, ...(person ? { person } : {}) });
  const max = Math.max(1, ...r.bars.map(b => b.billable + b.other));
  const personOptions = candidates.map(id => ({ id, name: nameFor(id, who, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
  const lineName = (l: Line) => {
    if (group === "person") return nameFor(l.memberId ?? "", who, locale);
    if (group === "client") return l.clientName ?? t.reports.noClient;
    if (group === "task") return `${l.projectName ?? ""} · ${l.taskName ?? t.reports.noTask}`;
    return l.projectName ?? "";
  };
  const top = Math.max(1, ...r.lines.map(l => l.minutes));
  const lines: LineRow[] = r.lines.map(l => {
    const share = l.budget ? l.budget.used / Math.max(1, l.budget.of) : null;
    return {
      key: l.key,
      name: lineName(l),
      client: group === "project" || group === "task" ? l.clientName ?? t.reports.noClient : null,
      color: l.color ?? null,
      minutes: l.minutes,
      hours: h(l.minutes),
      share: l.minutes / top,
      billableMinutes: l.billableMinutes,
      billable: h(l.billableMinutes),
      cents: l.cents,
      amount: l.cents ? money(l.cents, code, locale) : "–",
      costCents: l.costCents,
      cost: l.costCents ? money(l.costCents, code, locale) : "–",
      marginCents: l.cents - l.costCents,
      margin: l.cents || l.costCents ? margin(l.cents, l.costCents) : "–",
      loss: l.cents - l.costCents < 0,
      budget: l.budget && share !== null ? {
        share,
        state: share > 1 ? "over" : share >= 0.8 ? "near" : "",
        text: format(t.reports.budgetOf, { used: l.budget.kind === "hours" ? h(l.budget.used) : money(l.budget.used, code, locale, { whole: true }), total: l.budget.kind === "hours" ? h(l.budget.of) : money(l.budget.of, code, locale, { whole: true }) }),
      } : null,
    };
  });
  return (
    <div className="page wide">
      <PageHeader title={t.reports.title} intro={all ? undefined : t.reports.mine} secondary={r.minutes > 0 && <a className="button quiet" href={`/chest/reports/export?${params}`} download><Download />{t.reports.export}</a>} />

      <form method="get" className="filters" action="/chest/reports">
        <AutoSubmit />
        <fieldset className="chips">
          <legend className="visually-hidden">{t.reports.period}</legend>
          {presets.map(k => (
            <label key={k} className="chip-choice">
              <input type="radio" name="preset" value={k} defaultChecked={p.preset === k} />
              <span>{t.reports.presets[k]}</span>
            </label>
          ))}
        </fieldset>
        {p.preset !== "custom" && <><input type="hidden" name="from" value={p.from} /><input type="hidden" name="to" value={p.to} /></>}
        {p.preset === "custom" && (
          <div className="range">
            <RangeFields from={p.from} to={p.to} today={today()} label={t.reports.period} labels={t.date} lang={locale} />
            <button type="submit" className="button quiet">{t.reports.show}</button>
          </div>
        )}
        <div className="filter-row">
          <GroupChoice label={t.reports.group} value={group} options={groups.filter(g => all || g !== "person").map(g => ({ value: g, label: t.reports.groups[g] }))} />
          {all && (
            <div className="select-filter">
              <label className="label" htmlFor="person">{t.reports.person}</label>
              <select id="person" name="person" className="field" defaultValue={person}>
                <option value="">{t.reports.everyone}</option>
                {personOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="select-filter">
            <label className="label" htmlFor="kind">{t.reports.kind}</label>
            <select id="kind" name="kind" className="field" defaultValue={kind}>
              {kinds.map(k => <option key={k} value={k}>{t.reports.kinds[k]}</option>)}
            </select>
          </div>
          <noscript><button type="submit" className="button quiet">{t.reports.show}</button></noscript>
        </div>
      </form>

      <p className="range-label">{format(t.reports.range, { from: formatDay(r.from, locale, { day: "numeric", month: "long", year: "numeric" }), to: formatDay(r.to, locale, { day: "numeric", month: "long", year: "numeric" }) })}</p>

      <section className="tiles" aria-label={t.reports.total}>
        <div className="tile main"><span className="label">{t.reports.total}</span><span className="num big">{h(r.minutes)}</span></div>
        <div className="tile"><span className="label">{t.reports.billable}</span><span className="num">{h(r.billableMinutes)}</span><span className="small muted">{r.minutes ? format(t.reports.billableShare, { percent: percent(r.billableMinutes / r.minutes, locale) }) : "–"}</span></div>
        {!showCost && <div className="tile"><span className="label">{t.reports.notBillable}</span><span className="num">{h(r.minutes - r.billableMinutes)}</span></div>}
        {showMoney && <div className="tile"><span className="label">{t.reports.amount}</span><span className="num">{money(r.cents, code, locale)}</span></div>}
        {showCost && <div className="tile"><span className="label">{t.reports.cost}</span><span className="num">{money(r.costCents, code, locale)}</span></div>}
        {showCost && <div className={`tile${r.cents - r.costCents < 0 ? " loss" : ""}`}><span className="label">{t.reports.margin}</span><span className="num">{money(r.cents - r.costCents, code, locale)}</span>{r.cents > 0 && <span className="small muted">{format(t.reports.marginShare, { percent: percent((r.cents - r.costCents) / r.cents, locale) })}</span>}</div>}
      </section>

      {r.unnoted > 0 && <p className="notice small"><Note /><span>{plural(t.reports.unnoted, r.unnoted, locale)}</span></p>}
      {all && kind !== "uninvoiced" && r.uninvoiced > 0 && (
        <p className="small"><a href={`/chest/reports?${new URLSearchParams({ preset: p.preset, from: p.from, to: p.to, group, kind: "uninvoiced", ...(person ? { person } : {}) })}`}>{plural(t.reports.uninvoicedLink, r.uninvoiced, locale)}</a></p>
      )}
      {all && kind === "uninvoiced" && r.minutes > 0 && (
        <MarkInvoiced query={{ from: p.from, to: p.to, ...(person ? { person } : {}) }} label={plural(t.reports.markInvoiced, r.uninvoiced, locale)} locale={locale} t={{ reports: t.reports, errors: t.errors }} />
      )}

      {r.minutes === 0 ? (
        <EmptyState title={t.reports.empty} />
      ) : (
        <>
          <section className="chart" aria-labelledby="chart-title">
            <h2 id="chart-title" className="label">{r.unit === "day" ? t.reports.chart : t.reports.chartWeeks}</h2>
            <div className={`bars${r.bars.length > 16 ? " dense" : ""}`} aria-hidden="true">
              {r.bars.map(b => (
                <div key={b.day} className="bar-col" title={`${formatDay(b.day, locale)} · ${h(b.billable + b.other)}`}>
                  <div className="bar-stack" style={{ height: `${((b.billable + b.other) / max) * 100}%` }}>
                    {b.other > 0 && <span className="seg-other" style={{ flexGrow: b.other }} />}
                    {b.billable > 0 && <span className="seg-billable" style={{ flexGrow: b.billable }} />}
                  </div>
                  <span className="bar-label">{r.unit === "day" && r.bars.length <= 8 ? formatDay(b.day, locale, { weekday: "short", day: "numeric" }) : formatDay(b.day, locale, { day: "numeric" })}</span>
                </div>
              ))}
            </div>
            <p className="legend"><span className="key billable" />{t.reports.billable}<span className="key other" />{t.reports.notBillable}</p>
            <div className="visually-hidden"><table>
              <thead><tr><th scope="col">{t.reports.day}</th><th scope="col">{t.reports.billable}</th><th scope="col">{t.reports.notBillable}</th></tr></thead>
              <tbody>{r.bars.map(b => <tr key={b.day}><th scope="row">{formatDay(b.day, locale, { weekday: "long", day: "numeric", month: "long" })}</th><td>{h(b.billable)}</td><td>{h(b.other)}</td></tr>)}</tbody>
            </table></div>
          </section>

          <div className="breakdown">
            <LinesTable
              rows={lines}
              show={{ money: showMoney, cost: showCost, budget: group === "project" }}
              heading={t.reports.groups[group]}
              totals={{ hours: h(r.minutes), billable: h(r.billableMinutes), amount: money(r.cents, code, locale), cost: money(r.costCents, code, locale), margin: r.cents || r.costCents ? margin(r.cents, r.costCents) : "–" }}
              t={{ ...t.reports, over: t.projects.over, near: t.projects.near }}
              labels={t.table}
            />
          </div>
        </>
      )}
    </div>
  );
}
