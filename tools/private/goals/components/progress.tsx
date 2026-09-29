import { Shape } from "./icons.tsx";

// A progress bar and its number: the number is always written, the bar is
// its picture (screen readers get the bar's value from its label). `text`
// is the percentage in the reader's words ("42%", "42 %"), or a dash. The
// bar takes the colour of the confidence (its word and shape are beside
// it); without one, it is neutral.
export function Progress({ percent, text, label, big = false, confidence = null }: { percent: number | null; text: string; label: string; big?: boolean; confidence?: "on_track" | "at_risk" | "off_track" | null }) {
  const value = percent ?? 0;
  return (
    <div className="progress">
      <div className={`meter${big ? " big" : ""}${percent === null ? " empty" : ""}${confidence ? " " + confidence : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={text} aria-label={label}>
        <span style={{ width: `${percent === null ? 0 : Math.max(value, 1.5)}%` }} />
      </div>
      <span className={`pct${big ? " big" : ""}`} aria-hidden="true">{text}</span>
    </div>
  );
}

// Confidence as a pill: shape, colour and word.
export function Confidence({ value, words }: { value: "on_track" | "at_risk" | "off_track" | null; words: { on_track: string; at_risk: string; off_track: string; none: string } }) {
  return <span className={`conf ${value ?? "none"}`}><Shape confidence={value} />{words[value ?? "none"]}</span>;
}
