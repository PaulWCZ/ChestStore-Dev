// TimeSelect: a time of day as a list on a 24-hour clock, every `step`
// minutes — the same on every computer (the browser's time field shows
// AM/PM on many, and "--:--"). `end` offers 24:00 and not 00:00: the end
// of a slot. A value off the steps (09:10 from an import) is kept and
// shown. Controlled (value + onChange) or in a plain form (defaultValue).
// For a start and an end, move the end with `moveStart` (time.ts) so the
// duration stays.
import type { ReactElement } from "react";
import { timeOptions, timeText } from "./time.js";

type TimeSelectBase = {
  readonly id?: string;
  readonly name?: string;
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

// With `empty` (0.2.1), a first choice of that label means "no time" (the
// value "" in a form, null for onChange): an optional time.
export type TimeSelectProps = TimeSelectBase & (
  | { readonly empty?: undefined; readonly value?: number; readonly defaultValue?: number; readonly onChange?: (minutes: number) => void }
  | { readonly empty: string; readonly value?: number | null; readonly defaultValue?: number | null; readonly onChange?: (minutes: number | null) => void }
);

export function TimeSelect(props: TimeSelectProps): ReactElement {
  const { id, name, step = 15, end = false, min = 0, max = 1440, disabled, required, label, describedBy, className, empty } = props;
  const value: number | null | undefined = props.value;
  const defaultValue: number | null | undefined = props.defaultValue;
  const onChange = props.onChange as ((minutes: number | null) => void) | undefined;
  const steps = timeOptions({ step, end, min, max });
  const current = value !== undefined ? value : defaultValue;
  const options = current === undefined || current === null || steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
  const text = (m: number | null | undefined) => (m === null || m === undefined ? "" : String(m));
  const first = empty !== undefined ? "" : String(options[0] ?? 0);
  const control = onChange
    ? { value: value !== undefined && value !== null ? String(value) : defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : first, onChange: (e: { target: { value: string } }) => onChange(e.target.value === "" ? null : Number(e.target.value)) }
    : { defaultValue: current === undefined ? undefined : text(current) };
  return (
    <select id={id} name={name} className={`ck-field ck-select ck-time${className ? " " + className : ""}`} aria-label={label} aria-describedby={describedBy} disabled={disabled} required={required} {...control}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(m => <option key={m} value={m}>{timeText(m)}</option>)}
    </select>
  );
}
