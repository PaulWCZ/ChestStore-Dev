"use client";

// DateField: a day, typed in the tool's language ("29/09/2026", "29 sept",
// "demain") or chosen on a calendar, with "Today" and "Tomorrow" one tap
// away. Its value is an ISO date ("2026-09-29") or null. Never the
// browser's own date input: that one writes the computer's format
// (mm/dd/yyyy on many), whatever the member's language, and is a tiny
// target on a phone.
//
// `today` comes from the tool (the Chest's time zone, on the server): the
// kit never guesses the day from the machine's clock, so server and browser
// render the same page.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type Ref } from "react";
import { addDays, addMonths, calendarKey, clampDate, formatDate, isIsoDate, monthGrid, parseDate, partsOf, relativeDay, weekdayHeads, type IsoDate } from "./dates.js";
import { useFloat } from "./float.js";
import { CalendarIcon, ChevronLeft, ChevronRight } from "./icons.js";
import { fill } from "./text.js";
import { en, type DateWords } from "./words.js";

export type DateFieldProps = {
  readonly label: string;
  readonly value: IsoDate | null;
  readonly onChange: (value: IsoDate | null) => void;
  readonly today: IsoDate;
  readonly min?: IsoDate | null;
  readonly max?: IsoDate | null;
  // The quick chips; default Today and Tomorrow (those within min…max).
  readonly chips?: readonly { readonly label: string; readonly value: IsoDate }[] | false;
  readonly name?: string;
  readonly id?: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly labels?: DateWords;
};

export function DateField({ label, value, onChange, today, min = null, max = null, chips, name, id, hint, error, required = false, disabled = false, labels = en.date }: DateFieldProps): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-field";
  const hintId = auto + "-hint";
  const errorId = auto + "-error";
  const readId = auto + "-read";
  const [text, setText] = useState(value ? formatDate(value, labels) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Inside a dialog the calendar is placed over it, never cut at its edge.
  useFloat(box, panel, open, { scroll: false });

  useEffect(() => { setText(value ? formatDate(value, labels) : ""); setProblem(null); }, [value, labels]);

  // A click outside the calendar closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function commit(raw: string) {
    if (raw.trim() === "") {
      setProblem(null);
      if (value !== null) onChange(null);
      return;
    }
    const iso = parseDate(raw, labels, today);
    if (!iso) {
      setProblem(fill(labels.invalid, { example: formatDate(today, labels) }));
      return;
    }
    if (min && iso < min) return setProblem(fill(labels.tooEarly, { date: formatDate(min, labels, "long") }));
    if (max && iso > max) return setProblem(fill(labels.tooLate, { date: formatDate(max, labels, "long") }));
    setProblem(null);
    setText(formatDate(iso, labels));
    if (iso !== value) onChange(iso);
  }

  function pick(iso: IsoDate) {
    setProblem(null);
    setText(formatDate(iso, labels));
    setOpen(false);
    if (iso !== value) onChange(iso);
    button.current?.focus();
  }

  const quick = chips === false ? [] : (chips ?? [{ label: labels.today, value: today }, { label: labels.tomorrow, value: addDays(today, 1) }]).filter(c => (!min || c.value >= min) && (!max || c.value <= max));
  const shownError = error ?? problem;
  const reading = value ? relativeDay(value, today, labels) : null;
  const read = value ? (reading ? `${reading} · ` : "") + formatDate(value, labels, "long") : "";
  const described = [readId, hint ? hintId : null, shownError ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={`ck-date${shownError ? " ck-invalid" : ""}`} ref={wrap}>
      <label className="ck-label" htmlFor={fieldId}>{label}</label>
      <div className="ck-date-row">
        <div className="ck-date-box" ref={box}>
          <input
            id={fieldId}
            className="ck-field ck-date-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder={labels.placeholder}
            value={text}
            disabled={disabled}
            required={required}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={described}
            onChange={e => setText(e.target.value)}
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); }
              if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); setOpen(true); }
            }}
          />
          <button ref={button} type="button" className="ck-icon-button ck-date-open" aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(o => !o)}>
            <CalendarIcon /><span className="ck-vh">{open ? labels.closeCalendar : labels.openCalendar}</span>
          </button>
        </div>
        {quick.length > 0 && (
          <div className="ck-date-chips">
            {quick.map(c => (
              <button key={c.value} type="button" className="ck-chip-button" aria-pressed={value === c.value} disabled={disabled} onClick={() => { setProblem(null); setText(formatDate(c.value, labels)); if (c.value !== value) onChange(c.value); }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p id={readId} className="ck-hint ck-date-read">{read}</p>
      {hint && <p id={hintId} className="ck-hint">{hint}</p>}
      {shownError && <p id={errorId} className="ck-error">{shownError}</p>}
      {open && (
        <Calendar
          value={value}
          today={today}
          min={min}
          max={max}
          labels={labels}
          label={label}
          panelRef={panel}
          onPick={pick}
          onClose={() => { setOpen(false); button.current?.focus(); }}
        />
      )}
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </div>
  );
}

// The calendar popover: a grid of the month (the WAI-ARIA date picker
// dialog pattern). It opens on the chosen day (or today); arrows move,
// Page Up/Down change month, Enter or Space choose, Escape closes.
export function Calendar({ value, today, min = null, max = null, labels = en.date, label, onPick, onClose, panelRef }: { value: IsoDate | null; today: IsoDate; min?: IsoDate | null; max?: IsoDate | null; labels?: DateWords; label: string; onPick: (iso: IsoDate) => void; onClose: () => void; panelRef?: Ref<HTMLDivElement> }): ReactElement {
  const start = clampDate(value && isIsoDate(value) ? value : today, min, max);
  const [focus, setFocus] = useState<IsoDate>(start);
  const grid = useRef<HTMLTableElement>(null);
  const titleId = useId();
  const { year, month } = partsOf(focus);
  const weeks = monthGrid(year, month, labels.weekStart);
  const heads = weekdayHeads(labels);
  // Focus goes to the day when the calendar opens and follows the keys;
  // the month buttons keep it when clicked.
  const follow = useRef(true);
  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const out = (iso: IsoDate) => (min !== null && iso < min) || (max !== null && iso > max);
  function onKey(e: KeyboardEvent<HTMLTableElement>) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!out(focus)) onPick(focus);
      return;
    }
    const next = calendarKey(focus, e.key, { shift: e.shiftKey, weekStart: labels.weekStart, min, max });
    if (next) { e.preventDefault(); follow.current = true; setFocus(next); }
  }
  return (
    <div ref={panelRef} className="ck-calendar" role="dialog" aria-modal="false" aria-label={label} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <div className="ck-calendar-head">
        <button type="button" className="ck-icon-button" onClick={() => setFocus(clampDate(addMonths(focus, -1), min, max))}><ChevronLeft /><span className="ck-vh">{labels.previousMonth}</span></button>
        <h2 id={titleId} className="ck-calendar-title" aria-live="polite">{formatDate(focus, labels, "month")}</h2>
        <button type="button" className="ck-icon-button" onClick={() => setFocus(clampDate(addMonths(focus, 1), min, max))}><ChevronRight /><span className="ck-vh">{labels.nextMonth}</span></button>
      </div>
      <table ref={grid} className="ck-calendar-grid" role="grid" aria-labelledby={titleId} onKeyDown={onKey}>
        <thead>
          <tr>{heads.map(h => <th key={h.long} scope="col" abbr={h.long}><span aria-hidden="true">{h.short}</span><span className="ck-vh">{h.long}</span></th>)}</tr>
        </thead>
        <tbody>
          {weeks.map(week => (
            <tr key={week[0]!.iso}>
              {week.map(d => {
                const disabled = out(d.iso);
                return (
                  <td key={d.iso} role="gridcell" aria-selected={d.iso === value}>
                    <button
                      type="button"
                      data-day={d.iso}
                      tabIndex={d.iso === focus ? 0 : -1}
                      className={`ck-day${d.inMonth ? "" : " ck-day-out"}${d.iso === today ? " ck-day-today" : ""}${d.iso === value ? " ck-day-chosen" : ""}`}
                      aria-disabled={disabled || undefined}
                      aria-current={d.iso === today ? "date" : undefined}
                      aria-label={formatDate(d.iso, labels, "long")}
                      onClick={() => { if (!disabled) onPick(d.iso); else setFocus(d.iso); }}
                    >
                      {partsOf(d.iso).day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ck-calendar-foot">
        {!out(today) && <button type="button" className="ck-chip-button" onClick={() => onPick(today)}>{labels.today}</button>}
        <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={onClose}>{labels.closeCalendar}</button>
      </div>
    </div>
  );
}
