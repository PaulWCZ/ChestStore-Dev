"use client";

import { DateField, PeoplePicker, Segmented } from "@argentic/chest-ui/components";
import { localSearch, moveRangeEnd } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Back } from "../../../components/icons.tsx";
import { addDays, cost, daysOffFor, endAfterStart, isDay, weekday, works, type Counting, type Half, type Span } from "../../../lib/calendar.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay, formatDays, plural } from "../../../lib/i18n/format.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { leftIfApproved } from "../../../lib/left.ts";
import { askLeave } from "../actions.ts";

export type FormType = {
  id: string; key: string | null; name: string; color: string; halfDays: boolean; counting: "company" | "worked" | "calendar"; approval: boolean; notes: boolean; overdraw: boolean;
  // The balance: the one "left", the days waiting, and both in words.
  left: { left: number; pending: number; line: string } | null;
};
type Words = { form: Catalogue["form"]; units: Catalogue["units"]; holidays: Catalogue["holidays"]; errors: Catalogue["errors"]; span: Catalogue["span"]; date: Catalogue["date"]; peoplePicker: Catalogue["peoplePicker"] };

type OneDay = "whole" | "morning" | "afternoon";

export function RequestForm(props: {
  types: FormType[];
  rules: { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: string[] };
  workDays: number[] | null;
  first: string;
  today: string;
  earliest: string;
  latest: string;
  locale: string;
  answerer: string;
  people: { id: string; name: string }[] | null;
  who: string;
  whoName: string | null;
  events: { key: string; days: number; name: string }[];
  t: Words;
}) {
  const { types, rules, locale, t } = props;
  const router = useRouter();
  const forSomeone = props.whoName !== null;
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(props.first);
  const [end, setEnd] = useState(props.first);
  const [oneDay, setOneDay] = useState<OneDay>("whole");
  const [startHalf, setStartHalf] = useState<Half>("am");
  const [endHalf, setEndHalf] = useState<Half>("pm");
  const [note, setNote] = useState("");
  const [event, setEvent] = useState("");
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

  const counting: Counting = type?.counting === "calendar" ? "calendar" : type?.counting === "worked" ? "worked" : rules.counting;
  const valid = span !== null && span.end >= span.start && !(span.start === span.end && span.startHalf === "pm" && span.endHalf === "am");
  const days = valid && type ? cost(span, { counting, daysOff: daysOffFor(rules, span.start, addDays(span.end, 14)), workDays: props.workDays }) : 0;
  const holidaysIn = valid && type && counting !== "calendar" ? [...daysOffFor(rules, span.start, span.end)].filter(([d]) => works(d, { daysOff: new Set(), workDays: props.workDays }) || (weekday(d) === 6 && counting === "ouvrables")) : [];
  // What is left after, counting the other requests still waiting.
  const after = type?.left ? leftIfApproved(type.left) - days : null;
  const blocked = after !== null && after < 0 && days > 0 && !type!.overdraw;
  const legal = props.events.find(e => e.key === event);
  const needsEvent = type?.key === "family";

  // The kit's range rules (endAfterStart, tested in test/calendar.test.ts):
  // a new first day keeps the leave's length, never past the last day one
  // may ask for; a last day is never before the first.
  // The kit's DateField (0.2.3) follows a value changed from outside during
  // render: the last day moved by the first one shows at once.
  function changeStart(value: string | null) {
    const day = value ?? "";
    setStart(day);
    if (!isDay(day)) return;
    const moved = endAfterStart(start, end, day, props.latest);
    if (moved !== end) setEnd(moved);
  }

  function changeEnd(value: string | null) {
    setEnd(isDay(start) ? moveRangeEnd({ from: start, to: value }, value).to ?? "" : value ?? "");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!span || !type) return;
    setError(null);
    startTransition(async () => {
      const result = await askLeave({ typeId: type.id, ...span, note: type.notes ? note : "", ...(forSomeone ? { memberId: props.who } : {}), ...(needsEvent ? { event } : {}) });
      if (!result.ok) {
        setError(format(t.errors[result.error as ErrorCode], result.values));
        return;
      }
      router.push(forSomeone ? `/chest/people/${props.who}?done=recorded` : result.value.status === "approved" ? "/chest?done=declared" : "/chest?done=sent");
    });
  }

  return (
    <form className="ask" onSubmit={submit}>
      <Link className="back" href={forSomeone ? `/chest/people/${props.who}` : "/chest"}><Back />{t.form.back}</Link>
      <h1>{forSomeone ? format(t.form.titleFor, { name: props.whoName! }) : t.form.title}</h1>
      {props.people && (
        <div className="for-whom">
          <PeoplePicker
            label={t.form.forWhom}
            value={props.people.filter(p => p.id === props.who)}
            search={localSearch(props.people)}
            suggestions={props.people.slice(0, 8)}
            onChange={chosen => {
              const next = chosen[0];
              if (next && next.id !== props.who) router.push(next.id === props.people![0]!.id ? "/chest/new" : `/chest/new?for=${next.id}`);
            }}
            hint={forSomeone ? t.form.recordHint : undefined}
            labels={t.peoplePicker}
            lang={locale}
          />
        </div>
      )}

      <fieldset className="kinds">
        <legend>{t.form.type}</legend>
        {types.map(ty => (
          <label key={ty.id} className={`kind-option k-${ty.color}${ty.id === typeId ? " chosen" : ""}`}>
            <input type="radio" name="type" value={ty.id} checked={ty.id === typeId} onChange={() => setTypeId(ty.id)} />
            <span className="kind-name">{ty.name}</span>
            {ty.left !== null && <span className="kind-left">{ty.left.line}</span>}
          </label>
        ))}
      </fieldset>

      {needsEvent && (
        <div className="field-group">
          <label className="field-label" htmlFor="event">{t.form.event}</label>
          <select id="event" className="field" required value={event} onChange={e => setEvent(e.target.value)}>
            <option value="" disabled>{t.form.eventPick}</option>
            {props.events.map(ev => <option key={ev.key} value={ev.key}>{ev.name}</option>)}
          </select>
          {legal && <p className="muted small">{plural(t.form.eventDays, legal.days, locale)}</p>}
        </div>
      )}

      <div className="dates">
        <div className="date-field">
          <DateField id="start" label={t.form.firstDay} value={isDay(start) ? start : null} onChange={changeStart} today={props.today} min={props.earliest} max={props.latest} required labels={t.date} />
          {type?.halfDays && !single && (
            <Segmented label={t.form.firstDay} value={startHalf} onChange={setStartHalf} options={[{ value: "am", label: t.form.whole }, { value: "pm", label: t.form.afternoonOnly }]} />
          )}
        </div>
        <div className="date-field">
          <DateField id="end" label={t.form.lastDay} value={isDay(end) ? end : null} onChange={changeEnd} today={props.today} min={isDay(start) ? start : props.earliest} max={props.latest} chips={false} required labels={t.date} />
          {type?.halfDays && !single && (
            <Segmented label={t.form.lastDay} value={endHalf} onChange={setEndHalf} options={[{ value: "pm", label: t.form.whole }, { value: "am", label: t.form.morningOnly }]} />
          )}
        </div>
      </div>
      {type?.halfDays && single && (
        <div className="one-day">
          <Segmented label={t.form.oneDay} value={oneDay} onChange={setOneDay} options={(["whole", "morning", "afternoon"] as const).map(o => ({ value: o, label: t.form[o] }))} />
        </div>
      )}

      <div className="quote" aria-live="polite">
        <span className="quote-label">{t.form.costs}</span>
        <strong className="quote-days">{valid ? plural(t.units.days, days, locale) : "–"}</strong>
        {after !== null && valid && days > 0 && <span className="quote-after">{format(type!.left!.pending > 0 ? t.form.afterWaiting : t.form.after, { left: formatDays(after, locale) })}</span>}
        {after !== null && after < 0 && days > 0 && <p className="quote-warn">{format(blocked ? t.form.notEnough : t.form.below, { days: formatDays(-after, locale) })}</p>}
        {legal && valid && legal.days < days && <p className="quote-warn">{plural(t.form.eventMore, legal.days, locale)}</p>}
        {valid && days === 0 && <p className="quote-warn">{t.errors.no_days}</p>}
        {!valid && <p className="quote-warn">{t.errors.bad_dates}</p>}
        {holidaysIn.map(([d, key]) => (
          <p key={d} className="quote-hint">{format(t.form.holidayIncluded, { day: formatDay(d, locale), name: t.holidays[key] })}</p>
        ))}
        {counting === "calendar" ? <p className="quote-hint">{t.form.calendarDays}</p> : counting === "worked" ? <p className="quote-hint">{t.form.workedDays}</p> : rules.counting === "ouvrables" ? <p className="quote-hint">{t.form.saturdays}</p> : null}
        {props.workDays && counting !== "calendar" && counting !== "worked" && <p className="quote-hint">{t.form.partTime}</p>}
      </div>

      {type?.notes ? (
        <div className="note-field">
          <label htmlFor="note">{forSomeone ? t.form.noteRecorded : t.form.note} <span className="muted">({t.form.optional})</span></label>
          <textarea id="note" className="field" rows={2} maxLength={300} placeholder={t.form.notePlaceholder} value={note} onChange={e => setNote(e.target.value)} />
        </div>
      ) : (
        <p className="hint">{t.form.noNote}</p>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="send">
        <button type="submit" className="button big" disabled={pending || !valid || days <= 0 || blocked || (needsEvent && !event)}>
          {pending ? t.form.sending : forSomeone || !type?.approval ? t.form.record : t.form.send}
        </button>
        <span className="muted">{forSomeone ? t.form.recordedHint : type?.approval ? props.answerer : t.form.declaredHint}</span>
      </div>
    </form>
  );
}
