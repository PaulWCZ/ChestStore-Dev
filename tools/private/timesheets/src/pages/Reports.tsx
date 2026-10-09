import { chest } from "@argentic/chest-sdk/chest";
import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { BarStack } from "../components/gauges.tsx";
import { Download, Note } from "../components/icons.tsx";
import { compare, decimal, format, formatDay, localeOf, money, percent, plural } from "../i18n/index.ts";
import type { LineRow } from "../islands/ReportViews.tsx";
import { can } from "../lib/access.ts";
import { currency, today } from "../lib/clock.ts";
import { db } from "../lib/db.ts";
import { linked, recentHandoffs, sendable } from "../lib/handoff.ts";
import { nameFor, people } from "../lib/people.ts";
import { billableFilters, foundEntries, foundLimit, groups, isGroup, report, reportPeople, searchWords, type Line } from "../lib/reports.ts";
import { settings } from "../lib/settings.ts";
import { formatDuration, hours as decimalHours } from "../shared/duration.ts";
import { period, presets } from "../shared/periods.ts";

// A found entry of a project without a colour any more.
const fallbackColor = "teal";

// Where the time went (/chest/reports; preset, from, to, group, person,
// kind, q): a period, totals, a bar per day, a line per project (client,
// person, task), and the CSV. A member sees their own time only; managers
// also see amounts, costs and margins, and mark billable time invoiced.
// Hours are written as the company chose (4:05 or 4.08).
export async function reportsPage({ member, locale: lang, t, query }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  const all = can(member, "reports.all");
  const now = today();
  const thisYear = now.slice(0, 4);
  const p = period(query("preset"), now, query("from"), query("to"));
  const asked = query("group");
  const group = isGroup(asked) ? asked : "project";
  const kinds = billableFilters.filter(k => all || k !== "uninvoiced");
  const kind = (kinds as readonly string[]).includes(query("kind") ?? "") ? query("kind")! : "all";
  const person = all && query("person") ? query("person")! : "";
  // Words searched in the notes: the report, the CSV and the list of the
  // entries found all follow them.
  const words = searchWords(query("q")) ?? "";
  const sql = db();
  // Billable time to Quotes: offered when a tool receives it now (Quotes
  // installed AND linked by an admin); installed only, the panel says so;
  // the hand-offs made are listed either way (to take one back).
  const offer = all && kind === "uninvoiced";
  const [linkedNow, r, candidates, s, found, handed] = await Promise.all([
    offer ? linked() : Promise.resolve(false),
    report(sql, member, { from: p.from, to: p.to, group, person: person || undefined, billable: kind, q: words }),
    all ? reportPeople(sql, member) : Promise.resolve([]),
    settings(sql),
    foundEntries(sql, member, { from: p.from, to: p.to, person: person || undefined, billable: kind, q: words }),
    offer ? recentHandoffs(sql, member) : Promise.resolve([]),
  ]);
  const toSend = linkedNow ? await sendable(sql, member, p.from, p.to) : [];
  const quotes = offer && (linkedNow || chest.tools.get("quotes") !== null || handed.length > 0);
  const h = (minutes: number) => (s.hoursStyle === "decimal" ? decimal(decimalHours(minutes), locale) : formatDuration(minutes));
  const who = await people([...candidates, ...r.lines.flatMap(l => (l.memberId ? [l.memberId] : [])), ...found.map(f => f.memberId)]);
  const code = currency();
  const showMoney = all && r.priced;
  const showCost = all && r.costed;
  const margin = (cents: number, cost: number) => (cents ? format(t.reports.marginOf, { amount: money(cents - cost, code, locale), percent: percent((cents - cost) / cents, locale) }) : money(cents - cost, code, locale));
  const params = new URLSearchParams({ preset: p.preset, from: p.from, to: p.to, group, kind, ...(person ? { person } : {}), ...(words ? { q: words } : {}) });
  const max = Math.max(1, ...r.bars.map(b => b.billable + b.other));
  const personOptions = candidates.map(id => ({ id, name: nameFor(id, who, locale) })).sort((a, b) => compare(locale)(a.name, b.name));
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
        // A member sees a money budget's share, never an amount.
        text: l.budget.kind === "share" ? format(t.reports.budgetShare, { percent: percent(share, locale) })
          : format(t.reports.budgetOf, { used: l.budget.kind === "hours" ? h(l.budget.used) : money(l.budget.used, code, locale, { whole: true }), total: l.budget.kind === "hours" ? h(l.budget.of) : money(l.budget.of, code, locale, { whole: true }) }),
      } : null,
    };
  });
  const long = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  return {
    title: t.reports.title,
    body: (
      <div className="page wide">
        <PageHeader title={t.reports.title} intro={all ? undefined : t.reports.mine} secondary={r.minutes > 0 && <a className="button quiet" href={`/chest/reports/export?${params}`} download><Download />{t.reports.export}</a>} />

        <form method="get" className="filters" action="/chest/reports">
          <Island name="AutoSubmit" props={{}} />
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
              <Island id={`range-${p.from}-${p.to}`} name="RangeFields" props={{ from: p.from, to: p.to, today: now, label: t.reports.period, labels: t.kit.date, lang: locale }} />
              <button type="submit" className="button quiet">{t.reports.show}</button>
            </div>
          )}
          <div className="filter-row">
            <Island id={`group-${group}`} name="GroupChoice" props={{ label: t.reports.group, value: group, options: groups.filter(g => all || g !== "person").map(g => ({ value: g, label: t.reports.groups[g] })) }} />
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

        <Island id={`search-${words}`} name="NoteSearch" props={{ value: words, keep: { preset: p.preset, from: p.from, to: p.to, group, kind, person }, labels: t.kit.search }} />

        <p className="range-label">{format(t.reports.range, { from: long(r.from), to: long(r.to) })}</p>

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
        {all && kind === "uninvoiced" && r.minutes > 0 && !words && (
          <Island name="MarkInvoiced" props={{ query: { from: p.from, to: p.to, ...(person ? { person } : {}) }, label: plural(t.reports.markInvoiced, r.uninvoiced, locale), locale, t: { reports: t.reports, errors: t.errors } }} />
        )}

        {quotes && !words && (
          <Island
            name="QuotesPanel"
            props={{
              rows: toSend.map(x => ({ projectId: x.projectId, name: x.projectName, client: x.clientName ?? t.reports.noClient, color: x.color, hours: h(x.minutes), amount: x.cents ? money(x.cents, code, locale) : null, entries: x.entries })),
              handoffs: handed.map(x => ({
                id: x.id,
                title: x.clientName ? `${x.projectName} · ${x.clientName}` : x.projectName,
                sub: [format(t.reports.quotes.span, { from: formatDay(x.from, locale, { day: "numeric", month: "short" }), to: formatDay(x.to, locale, { day: "numeric", month: "short", year: "numeric" }) }), h(x.minutes), ...(x.cents !== null ? [money(x.cents, code, locale)] : [])].join(" · "),
                state: x.cancelled ? "cancelled" as const : x.invoiced ? "invoiced" as const : "waiting" as const,
                invoice: x.invoiceRef || null,
                link: x.invoiceLink,
              })),
              from: p.from,
              to: p.to,
              linked: linkedNow,
              locale,
              t: { reports: t.reports, errors: t.errors },
            }}
          />
        )}

        {words && (
          <section className="panel" id="found" aria-labelledby="found-title">
            <h2 id="found-title">{found.length >= foundLimit ? format(t.reports.foundMany, { count: foundLimit, q: words }) : plural(t.reports.found, found.length, locale, { q: words })}</h2>
            {found.length > 0 && (
              <ul className="found-list">
                {found.map(f => (
                  <li key={f.id}>
                    <span className={`swatch c-${f.color ?? fallbackColor}`} aria-hidden="true" />
                    <span className="found-what">
                      <span className="small muted">{[formatDay(f.day, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), ...(all ? [nameFor(f.memberId, who, locale)] : []), f.taskName ? `${f.projectName} · ${f.taskName}` : f.projectName].join(" · ")}</span>
                      <span>{f.note}</span>
                    </span>
                    <span className="num">{h(f.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {r.minutes === 0 ? (
          <EmptyState title={t.reports.empty} />
        ) : (
          <>
            <section className="chart" aria-labelledby="chart-title">
              <h2 id="chart-title" className="label">{r.unit === "day" ? t.reports.chart : t.reports.chartWeeks}</h2>
              <div className={`bars${r.bars.length > 16 ? " dense" : ""}`} aria-hidden="true">
                {r.bars.map(b => (
                  <div key={b.day} className="bar-col" title={`${formatDay(b.day, locale, undefined, thisYear)} · ${h(b.billable + b.other)}`}>
                    <BarStack billable={b.billable} other={b.other} max={max} />
                    <span className="bar-label">{r.unit === "day" && r.bars.length <= 8 ? formatDay(b.day, locale, { weekday: "short", day: "numeric" }) : formatDay(b.day, locale, { day: "numeric" })}</span>
                  </div>
                ))}
              </div>
              <p className="legend"><span className="key billable" />{t.reports.billable}<span className="key other" />{t.reports.notBillable}</p>
              <div className="visually-hidden"><table>
                <thead><tr><th scope="col">{t.reports.day}</th><th scope="col">{t.reports.billable}</th><th scope="col">{t.reports.notBillable}</th></tr></thead>
                <tbody>{r.bars.map(b => <tr key={b.day}><th scope="row">{formatDay(b.day, locale, { weekday: "long", day: "numeric", month: "long" }, thisYear)}</th><td>{h(b.billable)}</td><td>{h(b.other)}</td></tr>)}</tbody>
              </table></div>
            </section>

            <div className="breakdown">
              <Island
                id={`lines-${params}`}
                name="LinesTable"
                props={{
                  rows: lines,
                  show: { money: showMoney, cost: showCost, budget: group === "project" },
                  heading: t.reports.groups[group],
                  // Money only for whoever sees it (a member's page carries none).
                  totals: { hours: h(r.minutes), billable: h(r.billableMinutes), amount: showMoney ? money(r.cents, code, locale) : "", cost: showCost ? money(r.costCents, code, locale) : "", margin: showCost && (r.cents || r.costCents) ? margin(r.cents, r.costCents) : "" },
                  t: { ...t.reports, over: t.projects.over, near: t.projects.near },
                  labels: t.kit.table,
                }}
              />
            </div>
          </>
        )}
      </div>
    ),
  };
}
