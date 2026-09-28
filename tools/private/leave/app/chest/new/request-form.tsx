"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Back } from "../../../components/icons.tsx";
import { addDays, cost, daysOffFor, isDay, weekday, type Half, type Span } from "../../../lib/calendar.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay, formatDays, plural } from "../../../lib/i18n/format.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { askLeave } from "../actions.ts";

export type FormType = { id: string; name: string; color: string; halfDays: boolean; calendar: boolean; approval: boolean; notes: boolean; left: number | null };
type Words = { form: Catalogue["form"]; units: Catalogue["units"]; holidays: Catalogue["holidays"]; errors: Catalogue["errors"]; span: Catalogue["span"] };

type OneDay = "whole" | "morning" | "afternoon";

export function RequestForm(props: {
  types: FormType[];
  rules: { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: string[] };
  first: string;
  earliest: string;
  latest: string;
  locale: string;
  answerer: string;
  t: Words;
}) {
  const { types, rules, locale, t } = props;
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(props.first);
  const [end, setEnd] = useState(props.first);
  const [oneDay, setOneDay] = useState<OneDay>("whole");
  const [startHalf, setStartHalf] = useState<Half>("am");
  const [endHalf, setEndHalf] = useState<Half>("pm");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const type = types.find(ty => ty.id === typeId) ?? types[0];

  const single = start === end;
  const span: Span | null = useMemo(() => {
    if (!isDay(start) || !isDay(end)) return null;
    if (!type?.halfDays) return { start, startHalf: "am", end, endHalf: "pm" };
    if (single) return { start, end, startHalf: oneDay === "afternoon" ? "pm" : "am", endHalf: oneDay === "morning" ? "am" : "pm" };
    return { start, startHalf, end, endHalf };
  }, [start, end, single, oneDay, startHalf, endHalf, type?.halfDays]);

  const valid = span !== null && span.end >= span.start && !(span.start === span.end && span.startHalf === "pm" && span.endHalf === "am");
  const days = valid && type ? cost(span, { counting: type.calendar ? "calendar" : rules.counting, daysOff: daysOffFor(rules, span.start, addDays(span.end, 14)) }) : 0;
  const holidaysIn = valid && type && !type.calendar ? [...daysOffFor(rules, span.start, span.end)].filter(([d]) => weekday(d) !== 0 && (weekday(d) !== 6 || rules.counting === "ouvrables")) : [];
  const after = type?.left !== null && type?.left !== undefined ? type.left - days : null;

  function changeStart(value: string) {
    setStart(value);
    if (isDay(value) && (!isDay(end) || end < value)) setEnd(value);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!span || !type) return;
    setError(null);
    startTransition(async () => {
      const result = await askLeave({ typeId: type.id, ...span, note: type.notes ? note : "" });
      if (!result.ok) {
        setError(format(t.errors[result.error as ErrorCode], result.values));
        return;
      }
      router.push(result.value.status === "approved" ? "/chest?done=declared" : "/chest?done=sent");
    });
  }

  return (
    <form className="ask" onSubmit={submit}>
      <Link className="back" href="/chest"><Back />{t.form.back}</Link>
      <h1>{t.form.title}</h1>

      <fieldset className="kinds">
        <legend>{t.form.type}</legend>
        {types.map(ty => (
          <label key={ty.id} className={`kind-option k-${ty.color}${ty.id === typeId ? " chosen" : ""}`}>
            <input type="radio" name="type" value={ty.id} checked={ty.id === typeId} onChange={() => setTypeId(ty.id)} />
            <span className="kind-name">{ty.name}</span>
            {ty.left !== null && <span className="kind-left">{format(t.form.left, { days: formatDays(ty.left, locale) })}</span>}
          </label>
        ))}
      </fieldset>

      <div className="dates">
        <div className="date-field">
          <label htmlFor="start">{t.form.firstDay}</label>
          <input id="start" className="field" type="date" required min={props.earliest} max={props.latest} value={start} onChange={e => changeStart(e.target.value)} />
          {type?.halfDays && !single && (
            <div className="segmented" role="radiogroup" aria-label={t.form.firstDay}>
              <button type="button" role="radio" aria-checked={startHalf === "am"} onClick={() => setStartHalf("am")}>{t.form.whole}</button>
              <button type="button" role="radio" aria-checked={startHalf === "pm"} onClick={() => setStartHalf("pm")}>{t.form.afternoonOnly}</button>
            </div>
          )}
        </div>
        <div className="date-field">
          <label htmlFor="end">{t.form.lastDay}</label>
          <input id="end" className="field" type="date" required min={start || props.earliest} max={props.latest} value={end} onChange={e => setEnd(e.target.value)} />
          {type?.halfDays && !single && (
            <div className="segmented" role="radiogroup" aria-label={t.form.lastDay}>
              <button type="button" role="radio" aria-checked={endHalf === "pm"} onClick={() => setEndHalf("pm")}>{t.form.whole}</button>
              <button type="button" role="radio" aria-checked={endHalf === "am"} onClick={() => setEndHalf("am")}>{t.form.morningOnly}</button>
            </div>
          )}
        </div>
      </div>
      {type?.halfDays && single && (
        <div className="segmented wide" role="radiogroup" aria-label={t.form.oneDay}>
          {(["whole", "morning", "afternoon"] as const).map(o => (
            <button key={o} type="button" role="radio" aria-checked={oneDay === o} onClick={() => setOneDay(o)}>{t.form[o]}</button>
          ))}
        </div>
      )}

      <div className="quote" aria-live="polite">
        <span className="quote-label">{t.form.costs}</span>
        <strong className="quote-days">{valid ? plural(t.units.days, days, locale) : "–"}</strong>
        {after !== null && valid && days > 0 && <span className="quote-after">{format(t.form.after, { left: formatDays(after, locale) })}</span>}
        {after !== null && after < 0 && days > 0 && <p className="quote-warn">{format(t.form.below, { days: formatDays(-after, locale) })}</p>}
        {valid && days === 0 && <p className="quote-warn">{t.errors.no_days}</p>}
        {!valid && <p className="quote-warn">{t.errors.bad_dates}</p>}
        {holidaysIn.map(([d, key]) => (
          <p key={d} className="quote-hint">{format(t.form.holidayIncluded, { day: formatDay(d, locale), name: t.holidays[key] })}</p>
        ))}
        {type?.calendar ? <p className="quote-hint">{t.form.calendarDays}</p> : rules.counting === "ouvrables" ? <p className="quote-hint">{t.form.saturdays}</p> : null}
      </div>

      {type?.notes ? (
        <div className="note-field">
          <label htmlFor="note">{t.form.note} <span className="muted">({t.form.optional})</span></label>
          <textarea id="note" className="field" rows={2} maxLength={300} placeholder={t.form.notePlaceholder} value={note} onChange={e => setNote(e.target.value)} />
        </div>
      ) : (
        <p className="hint">{t.form.noNote}</p>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="send">
        <button type="submit" className="button big" disabled={pending || !valid || days <= 0}>{pending ? t.form.sending : type?.approval ? t.form.send : t.form.record}</button>
        <span className="muted">{type?.approval ? props.answerer : t.form.declaredHint}</span>
      </div>
    </form>
  );
}
