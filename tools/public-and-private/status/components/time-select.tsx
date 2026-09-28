"use client";

// A time of day as two 24-hour selects (hours, minutes in 5-minute steps):
// the browser's own time field would follow its locale (AM/PM on many
// computers). The value is minutes after midnight.
const pad = (n: number) => String(n).padStart(2, "0");

export function TimeSelect({ id, value, onChange, hourLabel, minuteLabel }: { id: string; value: number; onChange: (minutes: number) => void; hourLabel: string; minuteLabel: string }) {
  const h = Math.floor(value / 60), m = value % 60 - (value % 5);
  return (
    <span className="time-select">
      <select id={id} className="field" aria-label={hourLabel} value={h} onChange={e => onChange(Number(e.target.value) * 60 + m)}>
        {Array.from({ length: 24 }, (_, k) => <option key={k} value={k}>{pad(k)}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select className="field" aria-label={minuteLabel} value={m} onChange={e => onChange(h * 60 + Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, k) => <option key={k} value={k * 5}>{pad(k * 5)}</option>)}
      </select>
    </span>
  );
}
