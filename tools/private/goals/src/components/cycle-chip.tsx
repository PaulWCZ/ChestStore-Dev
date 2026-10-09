// A cycle's name, dates and place in time, with a thin line of the time
// gone (its percentage is written for screen readers). Each part after
// the name carries its dot before it: a line that wraps never ends on one.
export function CycleChip({ name, dates, when, elapsed, timeLabel }: { name: string; dates: string; when: string; elapsed: number; timeLabel: string }) {
  return (
    <div>
      <p className="cycle-chip">
        <strong>{name}</strong><span className="after-dot">{dates}</span><span className="after-dot">{when}</span>
      </p>
      <div className="timeline" role="img" aria-label={timeLabel}><svg aria-hidden="true" focusable="false"><rect className="gone" width={`${Math.min(100, Math.max(0, elapsed))}%`} height="100%" rx="2" /></svg></div>
    </div>
  );
}
