import { Trend as TrendIcon } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/index.ts";
import type { Trend as TrendData } from "../../../../lib/series.ts";

// A pulse survey over time: for each 1–5 question its average, for eNPS its
// score, one point per round. Drawn on the server as a small line (one
// series: the question names it), the latest number and its change in
// words, and the numbers in a table for whoever prefers them. A round whose
// results do not show yet leaves a gap ("Open": it has not closed;
// "Hidden": fewer than five answers).
type Props = { trend: TrendData; labels: Map<string, string>; locale: string; t: Pick<Catalogue, "results"> };

const W = 560;
const H = 150;
const PAD = { left: 56, right: 16, top: 14, bottom: 30 };

export function TrendCard({ trend, labels, locale, t }: Props) {
  if (trend.length === 0) return null;
  const number = (v: number, kind: "scale" | "enps") => (kind === "enps" && v > 0 ? "+" : "") + v.toLocaleString(locale, { maximumFractionDigits: 1 });
  return (
    <section className="card trend-card" aria-labelledby="trend">
      <h2 id="trend"><TrendIcon />{t.results.trend}</h2>
      {trend.map(line => {
        const [lo, hi] = line.kind === "enps" ? [-100, 100] : [1, 5];
        const n = line.points.length;
        const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i * (W - PAD.left - PAD.right)) / (n - 1));
        const y = (v: number) => PAD.top + ((hi - v) * (H - PAD.top - PAD.bottom)) / (hi - lo);
        const shown = line.points.map((p, i) => ({ ...p, i })).filter(p => p.value !== null);
        const last = shown.at(-1);
        const before = shown.at(-2);
        const change = last && before ? Math.round((last.value! - before.value!) * 10) / 10 : null;
        // The line breaks where a round has no number.
        const segments: string[] = [];
        let path = "";
        line.points.forEach((p, i) => {
          if (p.value === null) {
            if (path) segments.push(path);
            path = "";
          } else path += (path ? " L" : "M") + x(i).toFixed(1) + " " + y(p.value).toFixed(1);
        });
        if (path) segments.push(path);
        const ticks = line.kind === "enps" ? [-100, 0, 100] : [1, 3, 5];
        return (
          <div key={line.position} className="trend-line">
            <div className="trend-head">
              <h3>{line.text}</h3>
              {last && (
                <p className="trend-now">
                  <strong>{number(last.value!, line.kind)}</strong>
                  <span>{line.kind === "enps" ? t.results.enps : t.results.average5}</span>
                  {change !== null && change !== 0 && <span className={"delta " + (change > 0 ? "up" : "down")}>{change > 0 ? "▲ +" : "▼ "}{change.toLocaleString(locale, { maximumFractionDigits: 1 })}</span>}
                </p>
              )}
            </div>
            <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={line.text}>
              {ticks.map(v => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={"grid" + (v === 0 && line.kind === "enps" ? " zero" : "")} />
                  <text x={PAD.left - 6} y={y(v) + 4} className="tick" textAnchor="end">{number(v, line.kind)}</text>
                </g>
              ))}
              {segments.map((d, i) => <path key={i} d={d} className="line" />)}
              {line.points.map((p, i) => (
                <g key={p.pollId}>
                  {p.value !== null ? (
                    <circle cx={x(i)} cy={y(p.value)} r={p.current ? 6 : 4.5} className={"dot" + (p.current ? " current" : "")}>
                      <title>{`${labels.get(p.pollId) ?? ""} · ${number(p.value, line.kind)} · ${p.answered}`}</title>
                    </circle>
                  ) : (
                    <circle cx={x(i)} cy={H - PAD.bottom} r={3} className="dot empty"><title>{labels.get(p.pollId) ?? ""}</title></circle>
                  )}
                  {(i === 0 || i === n - 1) && <text x={x(i)} y={H - 4} className="tick" textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}>{labels.get(p.pollId) ?? ""}</text>}
                </g>
              ))}
            </svg>
            <details className="trend-table">
              <summary>{t.results.seeNumbers}</summary>
              <table>
                <thead><tr><th scope="col">{t.results.round}</th><th scope="col">{line.kind === "enps" ? t.results.enps : t.results.average5}</th><th scope="col">{t.results.answers5}</th></tr></thead>
                <tbody>
                  {line.points.map(p => (
                    <tr key={p.pollId}>
                      <th scope="row"><a href={`/chest/polls/${p.pollId}`}>{format(t.results.trendRound, { round: p.round })}</a> <small>{labels.get(p.pollId)}</small></th>
                      <td>{p.value === null ? (p.open ? t.results.trendOpen : t.results.trendHidden) : number(p.value, line.kind)}</td>
                      <td>{p.answered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">{t.results.trendHiddenHint}</p>
            </details>
          </div>
        );
      })}
    </section>
  );
}
