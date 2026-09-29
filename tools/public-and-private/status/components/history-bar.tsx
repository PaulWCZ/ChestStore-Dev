import type { Catalogue } from "../lib/i18n/index.ts";
import { day, format, percent, plural } from "../lib/i18n/format.ts";
import type { Day } from "../lib/timeline.ts";
import { Pulse, StateIcon } from "./icons.tsx";

// The last 90 days of one component: one tick a day, coloured by its worst
// state. Pointing at a tick (or focusing one of the days with an incident)
// shows the day, its state and its incidents. Screen readers get one
// sentence and a table instead of 90 ticks; a phone shows the last 30.
type Words = { public: Catalogue["public"]; states: Catalogue["states"] };

export function HistoryBar({ id, name, days, uptime, measured = null, titles, locale, t }: { id: string; name: string; days: Day[]; uptime: number | null; measured?: string | null; titles: Map<string, string>; locale: string; t: Words }) {
  const w = t.public;
  const bad = days.filter(d => d.incidents.length > 0 || (d.state !== "operational" && d.state !== "none"));
  const uptimeText = uptime === null ? w.noUptime : format(measured ? w.uptimeDeclared : w.uptime, { percent: percent(uptime, locale) });
  // Slower days do not lower the uptime (Statuspage's rule): they are said
  // beside it, so "100 %" never stands alone next to yellow ticks.
  const slower = days.filter(d => d.state === "degraded").length;
  const slowerText = slower > 0 ? plural(w.slowerDays, slower, locale) : null;
  const summary = `${format(w.historyLabel, { component: name, uptime: uptimeText })}${slowerText ? ` ${slowerText}.` : ""} ${plural(w.daysWithIncidents, bad.length, locale)}`;
  return (
    <div className="history">
      <p className="visually-hidden">{summary}</p>
      <ol className="ticks">
        {days.map((d, i) => {
          const edge = i < 12 ? " left" : i > days.length - 13 ? " right" : "";
          const tip = (
            <span className={`tip${edge}`}>
              <strong>{day(d.date, locale, { weekday: "short", day: "numeric", month: "short" })}</strong>
              <span className={`tip-state s-${d.state}`}><StateIcon state={d.state} />{d.state === "none" ? w.noData : d.incidents.length === 0 && d.state === "operational" ? w.noIncident : t.states[d.state]}</span>
              {d.incidents.slice(0, 3).map(inc => <span key={inc} className="tip-incident">{titles.get(inc) ?? ""}</span>)}
              {d.incidents.length > 3 && <span className="tip-incident">{plural(w.tickMore, d.incidents.length - 3, locale)}</span>}
            </span>
          );
          if (d.incidents.length === 0) return <li key={d.date} className={`tick s-${d.state}`} aria-hidden="true">{tip}</li>;
          const label = format(w.tickLabel, { day: day(d.date, locale, { day: "numeric", month: "long" }), state: t.states[d.state], incidents: d.incidents.map(inc => titles.get(inc) ?? "").join(", ") });
          return (
            <li key={d.date} className={`tick s-${d.state}`}>
              <a href={`/incidents/${d.incidents[0]}`} aria-label={label}>{tip}</a>
            </li>
          );
        })}
      </ol>
      <div className="history-legend" aria-hidden="true">
        <span className="far wide">{w.daysAgo}</span><span className="far narrow">{w.daysAgoPhone}</span>
        <span className="rule" />
        <span className="uptime">{uptimeText}{slowerText && <span className="slower"> · {slowerText}</span>}</span>
        <span className="rule" />
        <span>{w.today}</span>
      </div>
      {measured && <p className="measured"><Pulse />{measured}</p>}
      <details className="history-table">
        <summary>{w.tableShow}</summary>
        {bad.length === 0 ? <p>{w.noIncidentDays}</p> : (
          <table id={`days-${id}`}>
            <caption>{format(w.tableCaption, { component: name })}</caption>
            <thead><tr><th scope="col">{w.tableDay}</th><th scope="col">{w.tableState}</th><th scope="col">{w.tableIncidents}</th></tr></thead>
            <tbody>
              {bad.slice().reverse().map(d => (
                <tr key={d.date}>
                  <th scope="row">{day(d.date, locale, { day: "numeric", month: "long", year: "numeric" })}</th>
                  <td><span className={`state-label s-${d.state}`}><StateIcon state={d.state} /><span>{d.state === "none" ? w.noData : t.states[d.state]}</span></span></td>
                  <td>{d.incidents.map((inc, k) => <span key={inc}>{k > 0 ? ", " : ""}<a href={`/incidents/${inc}`}>{titles.get(inc) ?? inc}</a></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}
