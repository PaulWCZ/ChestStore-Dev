// TimeSelect: a time of day as a list on a 24-hour clock, every `step`
// minutes — the same on every computer (the browser's time field shows
// AM/PM on many, and "--:--"). `end` offers 24:00 and not 00:00: the end
// of a slot. A value off the steps (09:10 from an import) is kept and
// shown. Controlled (value + onChange) or in a plain form (defaultValue).
// For a start and an end, move the end with `moveStart` (time.ts) so the
// duration stays.
import type { ReactElement } from "react";
import { timeOptions, timeText } from "./time.js";

export type TimeSelectProps = {
  readonly id?: string;
  readonly name?: string;
  readonly value?: number;
  readonly defaultValue?: number;
  readonly onChange?: (minutes: number) => void;
  readonly step?: number;
  readonly end?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly required?: boolean;
  // When there is no visible <label for=id>.
  readonly label?: string;
  readonly describedBy?: string;
  readonly className?: string;
};

export function TimeSelect({ id, name, value, defaultValue, onChange, step = 15, end = false, min = 0, max = 1440, disabled, required, label, describedBy, className }: TimeSelectProps): ReactElement {
  const steps = timeOptions({ step, end, min, max });
  const current = value ?? defaultValue;
  const options = current === undefined || steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
  const control = onChange ? { value: value ?? defaultValue ?? options[0] ?? 0, onChange: (e: { target: { value: string } }) => onChange(Number(e.target.value)) } : { defaultValue: current };
  return (
    <select id={id} name={name} className={`ck-field ck-select ck-time${className ? " " + className : ""}`} aria-label={label} aria-describedby={describedBy} disabled={disabled} required={required} {...control}>
      {options.map(m => <option key={m} value={m}>{timeText(m)}</option>)}
    </select>
  );
}
