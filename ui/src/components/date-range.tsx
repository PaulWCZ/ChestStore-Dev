"use client";

// DateRangeField: a range of days — a leave, a trip, a rental — as two
// DateFields under one name ("From", "To"), with how many days it holds
// said under them (0.2.2; Leave used two DateFields and its own rules).
// Moving the first day keeps the range's length; the last day is never
// before the first (moveRangeStart, moveRangeEnd in dates.ts, tested).
// Its value: { from, to }, ISO dates or null while being chosen.
import { useId, type ReactElement, type ReactNode } from "react";
import { DateField } from "./date-field.js";
import { moveRangeEnd, moveRangeStart, rangeDays, type DateRange, type IsoDate } from "./dates.js";
import { plural } from "./text.js";
import { en, type DateWords } from "./words.js";

export type DateRangeFieldProps = {
  // The range's name (the legend of its two fields).
  readonly label: ReactNode;
  readonly value: DateRange;
  readonly onChange: (value: DateRange) => void;
  readonly today: IsoDate;
  readonly min?: IsoDate | null;
  readonly max?: IsoDate | null;
  // Form field names of the two ends (hidden inputs, ISO dates).
  readonly names?: { readonly from: string; readonly to: string };
  // The two text fields' ids (a <label for>, an error link, a test) (0.2.3).
  readonly ids?: { readonly from?: string; readonly to?: string };
  readonly hint?: string;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly labels?: DateWords;
  // Language of the plural rules (the words' language).
  readonly lang?: string;
  // Hide "3 days" under the fields (a tool that says it its own way).
  readonly hideLength?: boolean;
  // What is said under the fields in place of "3 days": the tool's own
  // count ("2.5 working days") (0.2.3). Read aloud when it changes.
  readonly length?: ReactNode;
  // false: moving the first day leaves the last one where it is (unless
  // the first passes it) — a filter's "from … to …", whose length means
  // nothing (0.2.3). Default true: a leave keeps its length.
  readonly keepLength?: boolean;
  // The first day's quick chips (Today, Tomorrow — or the tool's own):
  // `true` for the kit's, a list for the tool's; none by default (0.2.3).
  readonly chips?: boolean | readonly { readonly label: string; readonly value: IsoDate }[];
  // Something of the tool's own under each end (Leave's "whole day /
  // afternoon only" under the first day, "morning only" under the last)
  // (0.2.3).
  readonly below?: { readonly from?: ReactNode; readonly to?: ReactNode };
  readonly className?: string;
};

export function DateRangeField({ label, value, onChange, today, min = null, max = null, names, ids, hint, error, required = false, disabled = false, labels = en.date, lang = "en", hideLength = false, length: said, keepLength = true, chips = false, below, className }: DateRangeFieldProps): ReactElement {
  const id = useId();
  const days = rangeDays(value);
  const length = hideLength ? "" : said !== undefined ? said : days !== null ? plural(labels.rangeDays ?? en.date.rangeDays!, days, lang) : "";
  const describedBy = [hint ? id + "-hint" : null, error ? id + "-error" : null].filter(Boolean).join(" ") || undefined;
  const first = (
    <DateField label={labels.rangeFrom ?? en.date.rangeFrom!} value={value.from} onChange={from => onChange(moveRangeStart(value, from, { keepLength }))}
      today={today} min={min} max={max} labels={labels} required={required} disabled={disabled} {...(chips === true ? {} : { chips })} {...(ids?.from ? { id: ids.from } : {})} {...(names ? { name: names.from } : {})} />
  );
  const last = (
    <DateField label={labels.rangeTo ?? en.date.rangeTo!} value={value.to} onChange={to => onChange(moveRangeEnd(value, to))}
      today={today} min={value.from ?? min} max={max} labels={labels} required={required} disabled={disabled} chips={false} {...(ids?.to ? { id: ids.to } : {})} {...(names ? { name: names.to } : {})} />
  );
  return (
    <fieldset className={`ck-range${error ? " ck-invalid" : ""}${className ? " " + className : ""}`} disabled={disabled || undefined} aria-describedby={describedBy}>
      <legend className="ck-label">{label}</legend>
      <div className="ck-range-row">
        {below?.from !== undefined ? <div className="ck-range-end">{first}{below.from}</div> : first}
        {below?.to !== undefined ? <div className="ck-range-end">{last}{below.to}</div> : last}
      </div>
      <p className="ck-hint ck-range-length" aria-live="polite">{length}</p>
      {hint && <p id={id + "-hint"} className="ck-hint">{hint}</p>}
      {error && <p id={id + "-error"} className="ck-error">{error}</p>}
    </fieldset>
  );
}
