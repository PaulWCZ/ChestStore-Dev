"use client";

import { toTime } from "../lib/clock.ts";

// A time of day as a list (every 15 minutes, 24-hour clock): the browser's
// own time field follows its locale (AM/PM on many computers) and cuts the
// text; this is the same everywhere. end: offers 24:00 (the end of the day).
export function TimeSelect({ id, value, onChange, end = false, name, label }: { id: string; value: number; onChange?: (minutes: number) => void; end?: boolean; name?: string; label?: string }) {
  const steps = Array.from({ length: 96 }, (_, i) => (end ? (i + 1) * 15 : i * 15));
  const options = steps.includes(value) ? steps : [...steps, value].sort((a, b) => a - b);
  return (
    <select id={id} name={name} className="field time" aria-label={label} {...(onChange ? { value, onChange: e => onChange(Number(e.target.value)) } : { defaultValue: value })}>
      {options.map(m => <option key={m} value={m}>{m === 1440 ? "24:00" : toTime(m)}</option>)}
    </select>
  );
}
