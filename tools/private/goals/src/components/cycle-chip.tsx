// A cycle's name, dates and place in time, with a thin line of the time
// gone (its percentage is written for screen readers).
export function CycleChip({ name, dates, when, elapsed, timeLabel }: { name: string; dates: string; when: string; elapsed: number; timeLabel: string }) {
  return (
    <div>
      <p className="cycle-chip">
        <strong>{name}</strong><span className="dot" aria-hidden="true" /><span>{dates}</span><span className="dot" aria-hidden="true" /><span>{when}</span>
      </p>
      <div className="timeline" role="img" aria-label={timeLabel}><svg aria-hidden="true" focusable="false"><rect className="gone" width={`${Math.min(100, Math.max(0, elapsed))}%`} height="100%" rx="2" /></svg></div>
    </div>
  );
}
