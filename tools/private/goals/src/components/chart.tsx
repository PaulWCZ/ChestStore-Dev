import { Shape } from "./icons.tsx";

// A key result's values over the cycle, drawn by hand in SVG: the target
// as a dashed line, the check-ins as a sunrise line whose points carry the
// confidence's shape (circle, triangle, square) as well as its colour.
// Everything it says is also in the table beside it (details.table-alt).
export type ChartPoint = { at: number; value: number; confidence: "on_track" | "at_risk" | "off_track" };

type Props = {
  points: ChartPoint[];
  start: number;
  target: number;
  from: number;          // the cycle's first instant
  to: number;            // its last
  today: number;
  label: string;         // what a screen reader hears
  startText: string;
  targetText: string;
  fromText: string;
  toText: string;
  targetWord: string;
};

const W = 640, H = 190, left = 12, right = 12, top = 22, bottom = 30;

export function Chart({ points, start, target, from, to, today, label, startText, targetText, fromText, toText, targetWord }: Props) {
  const values = [start, target, ...points.map(p => p.value)];
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const span = Math.max(to - from, 1);
  const x = (t: number) => left + ((Math.min(Math.max(t, from), to) - from) / span) * (W - left - right);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const r = (n: number) => Math.round(n * 10) / 10;
  // The line starts at the start value on the first day.
  const path = [{ at: from, value: start }, ...points];
  const d = path.map((p, i) => `${i === 0 ? "M" : "L"}${r(x(p.at))} ${r(y(p.value))}`).join(" ");
  const last = path.at(-1)!;
  const area = `${d} L${r(x(last.at))} ${r(y(lo))} L${r(x(from))} ${r(y(lo))} Z`;
  const inCycle = today >= from && today <= to;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="grid" x1={left} x2={W - right} y1={y(start)} y2={y(start)} />
      <line className="target" x1={left} x2={W - right} y1={y(target)} y2={y(target)} />
      <text x={W - right} y={y(target) - 6} textAnchor="end">{targetWord} · {targetText}</text>
      {/* The start's value sits above its line: at the right end when the
          target is higher (the dates are at the bottom left), at the left
          when it is lower (the line starts from it, at the top). */}
      {start < target
        ? <text x={W - right} y={y(start) - 6} textAnchor="end">{startText}</text>
        : <text x={left} y={y(start) - 6}>{startText}</text>}
      {inCycle && <line className="today" x1={x(today)} x2={x(today)} y1={top - 8} y2={H - bottom} />}
      <path className="area" d={area} />
      <path className="line" d={d} />
      {points.map((p, i) => <Point key={i} x={x(p.at)} y={y(p.value)} confidence={p.confidence} />)}
      <line className="grid" x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} />
      <text x={left} y={H - 10}>{fromText}</text>
      <text x={W - right} y={H - 10} textAnchor="end">{toText}</text>
    </svg>
  );
}

function Point({ x, y, confidence }: { x: number; y: number; confidence: ChartPoint["confidence"] }) {
  const cls = `point ${confidence}`;
  if (confidence === "at_risk") return <path className={cls} d={`M${x} ${y - 7}L${x + 7} ${y + 5}H${x - 7}Z`} />;
  if (confidence === "off_track") return <rect className={cls} x={x - 5.5} y={y - 5.5} width="11" height="11" />;
  return <circle className={cls} cx={x} cy={y} r="6" />;
}

// The legend of the shapes, for the page that shows charts.
export function Legend({ words, label }: { words: { on_track: string; at_risk: string; off_track: string }; label: string }) {
  return (
    <ul className="tally" aria-label={label}>
      {(["on_track", "at_risk", "off_track"] as const).map(c => <li key={c} className={`shape-${c}`}><Shape confidence={c} /><span>{words[c]}</span></li>)}
    </ul>
  );
}
