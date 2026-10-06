import type { Outcome } from "@argentic/chest-app";
import { call, toast } from "@argentic/chest-app/client";
import { DateField, Segmented } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState } from "react";
import { formatDays, plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

type Words = { team: Catalogue["team"]; date: Catalogue["kit"]["date"] };

// Saves one of a person's fields as soon as it changes, with a toast; a
// refusal is a toast in the reader's words, and the field is put back.
// The saves of one field go one after the other, in the order made.
function useSave(t: Words, locale: string = "en") {
  const [pending, setPending] = useState(false);
  const last = useRef<Promise<unknown>>(Promise.resolve());
  // A last day may cancel or shorten leave after it: the toast says so.
  const said = (value: unknown): string => {
    const s = value as { settled?: number; days?: number } | null;
    return s && s.settled ? plural(t.team.endSettled, s.settled, locale, { days: formatDays(s.days ?? 0, locale) }) : t.team.saved;
  };
  const save = (step: () => Promise<Outcome<unknown>>, undo?: () => void) => {
    setPending(true);
    const next = last.current.then(step, step).then(result => {
      setPending(false);
      if (!result.ok) undo?.();
      else toast({ id: "saved", text: said(result.value) });
    });
    last.current = next.catch(() => undefined);
  };
  return { pending, save };
}

// The start date (since when leave is earned) or the last day (nothing is
// earned after it): saved when it changes; emptied, it is cleared.
export function DayField({ kind, memberId, value, label, today, locale, t }: { kind: "start" | "end"; memberId: string; value: string | null; label: string; today: string; locale: string; t: Words }) {
  const { pending, save } = useSave(t, locale);
  const [current, setCurrent] = useState(value);
  return (
    <div className="field-group day-field">
      <DateField id={`${kind}-date`} label={label} value={current} today={today} chips={false} disabled={pending} labels={t.date} onChange={next => {
        const before = current;
        setCurrent(next);
        save(() => call(kind === "start" ? "setStartDate" : "setEndDate", { memberId, day: next }), () => setCurrent(before));
      }} />
    </div>
  );
}

// The employee number payroll knows the person by: saved when the field
// is left.
export function NumberField({ memberId, value, t }: { memberId: string; value: string; t: Words }) {
  const { pending, save } = useSave(t);
  const [current, setCurrent] = useState(value);
  return (
    <div className="field-group">
      <label className="field-label" htmlFor="employee-number">{t.team.number}</label>
      <input id="employee-number" className="field compact number-field" maxLength={30} value={current} disabled={pending} onChange={e => setCurrent(e.target.value)} onBlur={() => {
        if (current.trim() !== value) save(() => call("setEmployeeNumber", { memberId, value: current }), () => setCurrent(value));
      }} />
    </div>
  );
}

// The days of the week the person works (part time, a four-day week):
// what their leave costs and the calendar follow it. Saved at each tick;
// one day at least.
export function WorkWeek({ memberId, value, days, t }: { memberId: string; value: readonly number[]; days: readonly { value: number; name: string }[]; t: Words }) {
  const { pending, save } = useSave(t);
  const [week, setWeek] = useState(value);
  return (
    <fieldset className="field-group week">
      <legend className="field-label">{t.team.workWeek}</legend>
      <div className="week-days">
        {days.map(d => (
          <label key={d.value} className="day-check">
            <input type="checkbox" checked={week.includes(d.value)} disabled={pending || (week.length === 1 && week.includes(d.value))} onChange={e => {
              const before = week;
              const next = e.target.checked ? [...week, d.value] : week.filter(x => x !== d.value);
              setWeek(next);
              save(() => call("setWorkDays", { memberId, days: next }), () => setWeek(before));
            }} />
            <span>{d.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// HR's two balance tools: add or remove days (with a reason), or state the
// balance as it is on a day — for paid leave, the days acquired (to take
// now) and those being earned.
export function BalanceForms({ memberId, types, today, t }: { memberId: string; types: readonly { id: string; name: string; split: boolean }[]; today: string; t: Words }) {
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [earning, setEarning] = useState("");
  const [bucket, setBucket] = useState<"acquired" | "earning">("acquired");
  const [reason, setReason] = useState("");
  const [onDate, setOnDate] = useState(today);
  // A day the field refuses as typed (unreadable): said under it; Save
  // waits — the day it held before is never sent in its place.
  const [onDateProblem, setOnDateProblem] = useState<string | null>(null);
  const refused = mode === "set" && onDateProblem !== null;
  // The day field leaves with "State the balance": its refusal goes with it.
  useEffect(() => { if (mode !== "set") setOnDateProblem(null); }, [mode]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const split = types.find(ty => ty.id === typeId)?.split ?? false;
  return (
    <form className="balance-form" onSubmit={e => {
      e.preventDefault();
      if (refused) return void document.getElementById("bf-on")?.focus();
      setError(null);
      setPending(true);
      // Days as typed ("2,5"): the server reads them.
      void (mode === "adjust"
        ? call("adjustBalance", { memberId, typeId, days, reason, ...(split ? { bucket } : {}) }, { quiet: true })
        : call("setBalance", { memberId, typeId, days, onDate, reason, ...(split ? { earning } : {}) }, { quiet: true })
      ).then(result => {
        setPending(false);
        if (!result.ok) return setError(result.message);
        setDays("");
        setEarning("");
        setReason("");
        toast({ id: "saved", text: t.team.saved });
      });
    }}>
      <Segmented label={t.team.balances} value={mode} onChange={setMode} options={[{ value: "adjust", label: t.team.adjust }, { value: "set", label: t.team.setBalance }]} />
      <p className="muted small">{mode === "adjust" ? t.team.adjustHint : split ? t.team.setSplitHint : t.team.setBalanceHint}</p>
      <div className="form-row">
        <div className="field-group">
          <label className="field-label" htmlFor="bf-type">{t.team.type}</label>
          <select id="bf-type" className="field" value={typeId} onChange={e => setTypeId(e.target.value)}>
            {types.map(ty => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
          </select>
        </div>
        <div className="field-group short">
          <label className="field-label" htmlFor="bf-days">{mode === "set" && split ? t.team.acquiredDays : t.team.days}</label>
          <input id="bf-days" className="field" inputMode="decimal" required value={days} onChange={e => setDays(e.target.value)} />
        </div>
        {mode === "set" && split && (
          <div className="field-group short">
            <label className="field-label" htmlFor="bf-earning">{t.team.earningDays}</label>
            <input id="bf-earning" className="field" inputMode="decimal" value={earning} onChange={e => setEarning(e.target.value)} />
          </div>
        )}
        {mode === "adjust" && split && (
          <div className="field-group">
            <label className="field-label" htmlFor="bf-bucket">{t.team.bucket}</label>
            <select id="bf-bucket" className="field" value={bucket} onChange={e => setBucket(e.target.value === "earning" ? "earning" : "acquired")}>
              <option value="acquired">{t.team.bucketAcquired}</option>
              <option value="earning">{t.team.bucketEarning}</option>
            </select>
          </div>
        )}
        {mode === "set" && (
          <div className="field-group day-field">
            <DateField id="bf-on" label={t.team.onDate} value={onDate || null} onChange={v => setOnDate(v ?? "")} onProblem={setOnDateProblem} today={today} required labels={t.date} />
          </div>
        )}
        <div className="field-group grow">
          <label className="field-label" htmlFor="bf-reason">{t.team.reason}</label>
          <input id="bf-reason" className="field" required={mode === "adjust"} maxLength={300} placeholder={t.team.reasonPlaceholder} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <button type="submit" className="button" disabled={pending || refused}>{t.team.save}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
