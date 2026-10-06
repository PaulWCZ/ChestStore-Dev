// Sizes drawn from data without a style attribute (the policy refuses
// inline styles): SVG shapes whose width or height is an attribute.
// Decorative: the number beside each says the same in words.
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const fixed = (n: number) => Math.round(n * 1000) / 10;

// A budget's gauge: how much of it is used (over 100 % stays full).
export function Meter({ value }: { value: number }) {
  return (
    <svg className="meter" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="meter-fill" x="0" y="0" height="8" width={fixed(clamp(value))} />
    </svg>
  );
}

// A line's share of the largest line of a report.
export function Share({ value }: { value: number }) {
  return (
    <svg className="share" viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="share-fill" x="0" y="0" height="3" width={fixed(clamp(value))} />
    </svg>
  );
}

// A day's (or a week's) bar of the report's chart: its height is its time
// against the busiest one's; billable at the bottom, the rest above.
export function BarStack({ billable, other, max }: { billable: number; other: number; max: number }) {
  const b = fixed(clamp(billable / max));
  const o = fixed(clamp(other / max));
  return (
    <svg className="bar-stack" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {other > 0 && <rect className="seg-other" x="0" width="10" y={Math.max(0, 100 - b - o)} height={o} />}
      {billable > 0 && <rect className="seg-billable" x="0" width="10" y={100 - b} height={b} />}
    </svg>
  );
}
