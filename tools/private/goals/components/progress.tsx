import { StatusBadge } from "@argentic/chest-ui/components";
import { Shape } from "./icons.tsx";

type Level = "on_track" | "at_risk" | "off_track";

// The contract's state for each confidence: on track is "ok", at risk
// "wait", off track "danger" — always with its word and its shape.
export const tones = { on_track: "ok", at_risk: "wait", off_track: "danger" } as const;

// A progress bar and its number: the number is always written, the bar is
// its picture (screen readers get the bar's value from its label). `text`
// is the percentage in the reader's words ("42%", "42 %"), or a dash. The
// bar takes the colour of the confidence (its word and shape are beside
// it); without one, it is neutral.
export function Progress({ percent, text, label, big = false, confidence = null }: { percent: number | null; text: string; label: string; big?: boolean; confidence?: Level | null }) {
  const value = percent ?? 0;
  return (
    <div className="progress">
      <div className={`meter${big ? " big" : ""}${percent === null ? " empty" : ""}${confidence ? " " + tones[confidence] : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={text} aria-label={label}>
        <span style={{ width: `${percent === null ? 0 : Math.max(value, 1.5)}%` }} />
      </div>
      <span className={`pct${big ? " big" : ""}`} aria-hidden="true">{text}</span>
    </div>
  );
}

// Confidence as the kit's state badge: Goals' shape (a disc, a triangle, a
// square — the same as in the chart and the tallies), its word, the
// state's colour. No check-in yet is neutral, with a dashed ring.
export function Confidence({ value, words }: { value: Level | null; words: { on_track: string; at_risk: string; off_track: string; none: string } }) {
  return <StatusBadge size="s" tone={value ? tones[value] : "neutral"} icon={<Shape confidence={value} />} label={words[value ?? "none"]} />;
}
