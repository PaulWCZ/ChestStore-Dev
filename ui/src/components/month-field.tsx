"use client";

// MonthField: a month ("2026-09"), for a month's report, a leave balance, a
// timesheet: the month in words in a list, with the previous and the next
// month one tap away. Its words are the date words (DateWords: months,
// "Previous month", "Next month"); `today` comes from the tool (the Chest's
// time zone), so server and browser render the same list. Never the
// browser's own month input (absent from Safari and Firefox on desktop,
// and in the computer's language).
import { useId, type ReactElement } from "react";
import { addYearMonths, formatDate, isYearMonth, monthsFrom, type IsoDate, type YearMonth } from "./dates.js";
import { ChevronLeft, ChevronRight } from "./icons.js";
import { en, type DateWords } from "./words.js";

export type MonthFieldProps = {
  readonly label: string;
  readonly value: YearMonth;
  readonly onChange: (value: YearMonth) => void;
  readonly today: IsoDate;
  // The first and last months offered (default: a year back, two ahead).
  readonly min?: YearMonth | null;
  readonly max?: YearMonth | null;
  readonly name?: string;
  readonly id?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  // Keep the label for screen readers only (a toolbar that says it).
  readonly hideLabel?: boolean;
  readonly labels?: DateWords;
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MonthField({ label, value, onChange, today, min, max, name, id, hint, disabled = false, hideLabel = false, labels = en.date }: MonthFieldProps): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-month";
  const hintId = auto + "-hint";
  const now = today.slice(0, 7);
  const first = min ?? addYearMonths(now, -12);
  const last = max ?? addYearMonths(now, 24);
  const shown = isYearMonth(value) ? value : now;
  const months = monthsFrom(first, last);
  if (!months.includes(shown)) months.push(shown), months.sort();
  const previous = addYearMonths(shown, -1);
  const next = addYearMonths(shown, 1);
  return (
    <div className="ck-month">
      <label className={hideLabel ? "ck-vh" : "ck-label"} htmlFor={fieldId}>{label}</label>
      <div className="ck-month-row">
        <button type="button" className="ck-icon-button" disabled={disabled || previous < first} onClick={() => onChange(previous)}>
          <ChevronLeft /><span className="ck-vh">{labels.previousMonth}</span>
        </button>
        <select id={fieldId} name={name} className="ck-field ck-select ck-month-select" value={shown} disabled={disabled} aria-describedby={hint ? hintId : undefined} onChange={e => onChange(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{capital(formatDate(`${m}-01`, labels, "month"))}</option>)}
        </select>
        <button type="button" className="ck-icon-button" disabled={disabled || next > last} onClick={() => onChange(next)}>
          <ChevronRight /><span className="ck-vh">{labels.nextMonth}</span>
        </button>
      </div>
      {hint && <p id={hintId} className="ck-hint">{hint}</p>}
    </div>
  );
}
