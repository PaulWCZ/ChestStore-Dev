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
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { addDays, addMonths, calendarKey, clampDate, formatDate, isIsoDate, monthGrid, parseDate, partsOf, relativeDay, weekdayHeads, type IsoDate } from "./dates.js";
import { useFloat } from "./float.js";
import { CalendarIcon, ChevronLeft, ChevronRight } from "./icons.js";
import { fill } from "./text.js";
import { en, type DateWords } from "./words.js";

export type DateFieldProps = {
  // Words, or more (a required mark) (0.2.2: a ReactNode).
  readonly label: ReactNode;
  // The label for screen readers only (a field in a table cell whose
  // column says it) (0.2.2).
  readonly hideLabel?: boolean;
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
  // Ids of the tool's own lines that describe the field (a rule, a note),
  // read after the kit's (0.2.2).
  readonly describedBy?: string;
  // "full" (default) or "compact": the field and its calendar only — no
  // chips, the date in words read by screen readers but not shown — for a
  // table cell or a dense row (0.2.2).
  readonly variant?: "full" | "compact";
  // Enter in the field, once the date is read: the date (null when empty),
  // for a tool that sends its form on Enter. Not called for a date that
  // cannot be read (0.2.2).
  readonly onEnter?: (value: IsoDate | null) => void;
  readonly className?: string;
} & { readonly [data: `data-${string}`]: string | number | boolean | undefined };

export function DateField(props: DateFieldProps): ReactElement {
  const { label, hideLabel = false, value, onChange, today, min = null, max = null, chips, name, id, hint, error, required = false, disabled = false, labels = en.date, describedBy, variant = "full", onEnter, className } = props;
  const data = Object.fromEntries(Object.entries(props).filter(([k, v]) => k.startsWith("data-") && v !== undefined));
  const compact = variant === "compact";
  const auto = useId();
  const fieldId = id ?? auto + "-field";
  const hintId = auto + "-hint";
  const errorId = auto + "-error";
  const readId = auto + "-read";
  // The text follows the value: when the value changes from outside (the
  // other end of a range moved it, a reset, a server's answer), the text
  // is the new value's during that very render — React's "adjust state
  // when a prop changes" — never in an effect, which lands after the
  // commit, possibly after the person started typing, and then mixed the
  // two texts ("25/01/20272027-01-28", Leave, 0.2.3). Keyed on the value
  // and its words, not on the words object: a tool that passes
  // `labels={{...}}` anew each render no longer resets what is typed.
  // Two cases keep what the person does: while they are typing (text not
  // yet read), their text stays — reading it on blur decides; and when
  // the whole old date was selected (Tab into the field selects it), the
  // new one is selected in its place, so what they type replaces it
  // rather than being added after it.
  const shown = value ? formatDate(value, labels) : "";
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [seen, setSeen] = useState({ value, shown });
  const field = useRef<HTMLInputElement>(null);
  const reselect = useRef<string | null>(null);
  if (seen.value !== value || seen.shown !== shown) {
    setSeen({ value, shown });
    if (!typing) {
      const el = field.current;
      reselect.current = el !== null && typeof document !== "undefined" && document.activeElement === el && el.value !== "" && el.selectionStart === 0 && el.selectionEnd === el.value.length ? shown : null;
      setText(shown);
      setProblem(null);
    }
  }
  useLayoutEffect(() => {
    const el = field.current;
    if (reselect.current !== null && el && el.value === reselect.current && document.activeElement === el) el.select();
    reselect.current = null;
  });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Inside a dialog the calendar is placed over it, never cut at its edge.
  useFloat(box, panel, open, { scroll: false });

  // A click outside the calendar closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // commit reads what was typed: the date (null for nothing), or
  // undefined when it cannot be read (the problem is then shown).
  function commit(raw: string): IsoDate | null | undefined {
    setTyping(false);
    if (raw.trim() === "") {
      setProblem(null);
      if (value !== null) onChange(null);
      return null;
    }
    const iso = parseDate(raw, labels, today);
    if (!iso) {
      setProblem(fill(labels.invalid, { example: formatDate(today, labels) }));
      return undefined;
    }
    if (min && iso < min) { setProblem(fill(labels.tooEarly, { date: formatDate(min, labels, "long") })); return undefined; }
    if (max && iso > max) { setProblem(fill(labels.tooLate, { date: formatDate(max, labels, "long") })); return undefined; }
    setProblem(null);
    setText(formatDate(iso, labels));
    if (iso !== value) onChange(iso);
    return iso;
  }

  function pick(iso: IsoDate) {
    setTyping(false);
    setProblem(null);
    setText(formatDate(iso, labels));
    setOpen(false);
    if (iso !== value) onChange(iso);
    button.current?.focus();
  }

  const quick = chips === false || (compact && chips === undefined) ? [] : (chips ?? [{ label: labels.today, value: today }, { label: labels.tomorrow, value: addDays(today, 1) }]).filter(c => (!min || c.value >= min) && (!max || c.value <= max));
  const shownError = error ?? problem;
  const reading = value ? relativeDay(value, today, labels) : null;
  const read = value ? (reading ? `${reading} · ` : "") + formatDate(value, labels, "long") : "";
  const described = [readId, hint ? hintId : null, shownError ? errorId : null, describedBy ?? null].filter(Boolean).join(" ");
  const labelId = auto + "-label";

  return (
    <div className={`ck-date${compact ? " ck-date-compact" : ""}${shownError ? " ck-invalid" : ""}${className ? " " + className : ""}`} ref={wrap} {...data}>
      <label id={labelId} className={hideLabel ? "ck-vh" : "ck-label"} htmlFor={fieldId}>{label}</label>
      <div className="ck-date-row">
        <div className="ck-date-box" ref={box}>
          <input
            ref={field}
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
            onChange={e => { setText(e.target.value); setTyping(true); }}
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                const got = commit(e.currentTarget.value);
                if (got !== undefined) onEnter?.(got);
              }
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
              <button key={c.value} type="button" className="ck-chip-button" aria-pressed={value === c.value} disabled={disabled} onClick={() => { setTyping(false); setProblem(null); setText(formatDate(c.value, labels)); if (c.value !== value) onChange(c.value); }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p id={readId} className={compact ? "ck-vh" : "ck-hint ck-date-read"}>{read}</p>
      {hint && <p id={hintId} className="ck-hint">{hint}</p>}
      {shownError && <p id={errorId} className="ck-error">{shownError}</p>}
      {open && (
        <Calendar
          value={value}
          today={today}
          min={min}
          max={max}
          labels={labels}
          labelledBy={labelId}
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
//
// `multiple` (0.2.2): several days — `selected` holds them, Enter, Space
// or a click on a day calls onPick to add or take it away, and the
// calendar stays (the grid says aria-multiselectable). `inline`: part of
// the page, not a popover (a planning page, a form's list of days).
export type CalendarProps = {
  value: IsoDate | null;
  today: IsoDate;
  min?: IsoDate | null;
  max?: IsoDate | null;
  labels?: DateWords;
  // Its name for screen readers: a string, or the id of what names it.
  label?: string;
  labelledBy?: string;
  onPick: (iso: IsoDate) => void;
  onClose?: () => void;
  panelRef?: Ref<HTMLDivElement>;
  multiple?: boolean;
  selected?: readonly IsoDate[];
  inline?: boolean;
  className?: string;
};

export function Calendar({ value, today, min = null, max = null, labels = en.date, label, labelledBy, onPick, onClose, panelRef, multiple = false, selected = [], inline = false, className }: CalendarProps): ReactElement {
  const first = multiple ? [...selected].sort()[0] ?? null : value;
  const start = clampDate(first && isIsoDate(first) ? first : today, min, max);
  const chosen = (iso: IsoDate) => (multiple ? selected.includes(iso) : iso === value);
  const [focus, setFocus] = useState<IsoDate>(start);
  const grid = useRef<HTMLTableElement>(null);
  const titleId = useId();
  const { year, month } = partsOf(focus);
  const weeks = monthGrid(year, month, labels.weekStart);
  const heads = weekdayHeads(labels);
  // Focus goes to the day when the calendar opens (a popover) and follows
  // the keys; the month buttons keep it when clicked.
  const follow = useRef(!inline);
  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const out = (iso: IsoDate) => (min !== null && iso < min) || (max !== null && iso > max);
  function onKey(e: KeyboardEvent<HTMLTableElement>) {
    if (e.key === "Escape") { if (onClose) { e.preventDefault(); onClose(); } return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!out(focus)) onPick(focus);
      return;
    }
    const next = calendarKey(focus, e.key, { shift: e.shiftKey, weekStart: labels.weekStart, min, max });
    if (next) { e.preventDefault(); follow.current = true; setFocus(next); }
  }
  return (
    <div ref={panelRef} className={`ck-calendar${inline ? " ck-calendar-inline" : ""}${className ? " " + className : ""}`} role={inline ? "group" : "dialog"} aria-modal={inline ? undefined : false} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} onKeyDown={e => { if (e.key === "Escape" && onClose) { e.preventDefault(); onClose(); } }}>
      <div className="ck-calendar-head">
        <button type="button" className="ck-icon-button" onClick={() => setFocus(clampDate(addMonths(focus, -1), min, max))}><ChevronLeft /><span className="ck-vh">{labels.previousMonth}</span></button>
        <h2 id={titleId} className="ck-calendar-title" aria-live="polite">{formatDate(focus, labels, "month")}</h2>
        <button type="button" className="ck-icon-button" onClick={() => setFocus(clampDate(addMonths(focus, 1), min, max))}><ChevronRight /><span className="ck-vh">{labels.nextMonth}</span></button>
      </div>
      <table ref={grid} className="ck-calendar-grid" role="grid" aria-labelledby={titleId} aria-multiselectable={multiple || undefined} onKeyDown={onKey}>
        <thead>
          <tr>{heads.map(h => <th key={h.long} scope="col" abbr={h.long}><span aria-hidden="true">{h.short}</span><span className="ck-vh">{h.long}</span></th>)}</tr>
        </thead>
        <tbody>
          {weeks.map(week => (
            <tr key={week[0]!.iso}>
              {week.map(d => {
                const disabled = out(d.iso);
                return (
                  <td key={d.iso} role="gridcell" aria-selected={chosen(d.iso)}>
                    <button
                      type="button"
                      data-day={d.iso}
                      tabIndex={d.iso === focus ? 0 : -1}
                      className={`ck-day${d.inMonth ? "" : " ck-day-out"}${d.iso === today ? " ck-day-today" : ""}${chosen(d.iso) ? " ck-day-chosen" : ""}`}
                      aria-disabled={disabled || undefined}
                      aria-current={d.iso === today ? "date" : undefined}
                      aria-label={formatDate(d.iso, labels, "long")}
                      onClick={() => { if (!disabled) { if (multiple) setFocus(d.iso); onPick(d.iso); } else setFocus(d.iso); }}
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
      {(!multiple || onClose) && (
        <div className="ck-calendar-foot">
          {!multiple && !out(today) && <button type="button" className="ck-chip-button" onClick={() => onPick(today)}>{labels.today}</button>}
          {onClose && <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={onClose}>{labels.closeCalendar}</button>}
        </div>
      )}
    </div>
  );
}
