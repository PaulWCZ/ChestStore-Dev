"use client";

import { DateField, Segmented, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { Result } from "../../../../lib/errors.ts";
import { adjustBalance, setBalance, setEmployeeNumber, setEndDate, setStartDate, setWorkDays } from "../../actions.ts";

type Words = { team: Catalogue["team"]; errors: Catalogue["errors"]; date: Catalogue["date"] };

// Saves one of a person's fields as soon as it changes, with a toast.
function useSave(t: Words, locale: string = "en") {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  // A last day may cancel or shorten leave after it: the toast says so.
  const said = (value: unknown): string => {
    const s = value as { settled?: number; days?: number } | null;
    return s && s.settled ? plural(t.team.endSettled, s.settled, locale, { days: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(s.days ?? 0) }) : t.team.saved;
  };
  const save = (step: () => Promise<Result<unknown>>, undo?: () => void) => start(async () => {
    const result = await step();
    if (!result.ok) undo?.();
    toast(result.ok ? { id: "saved", text: said(result.value) } : { text: format(t.errors[result.error as ErrorCode], result.values), tone: "error" });
    router.refresh();
  });
  return { pending, save };
}

// The start date (since when leave is earned) or the last day (nothing is
// earned after it): saved when it changes; emptied, it is cleared.
export function DayField({ kind, memberId, value, label, today, locale, t }: { kind: "start" | "end"; memberId: string; value: string | null; label: string; today: string; locale?: string; t: Words }) {
  const { pending, save } = useSave(t, locale);
  const [current, setCurrent] = useState(value);
  return (
    <div className="field-group day-field">
      <DateField id={`${kind}-date`} label={label} value={current} today={today} chips={false} disabled={pending} labels={t.date} onChange={next => {
        const before = current;
        setCurrent(next);
        save(() => (kind === "start" ? setStartDate(memberId, next) : setEndDate(memberId, next)), () => setCurrent(before));
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
        if (current.trim() !== value) save(() => setEmployeeNumber(memberId, current), () => setCurrent(value));
      }} />
    </div>
  );
}

// The days of the week the person works (part time, a four-day week):
// what their leave costs and the calendar follow it. Saved at each tick;
// one day at least.
export function WorkWeek({ memberId, value, days, t }: { memberId: string; value: number[]; days: { value: number; name: string }[]; t: Words }) {
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
              save(() => setWorkDays(memberId, next), () => setWeek(before));
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
export function BalanceForms({ memberId, types, today, t }: { memberId: string; types: { id: string; name: string; split: boolean }[]; today: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [earning, setEarning] = useState("");
  const [bucket, setBucket] = useState<"acquired" | "earning">("acquired");
  const [reason, setReason] = useState("");
  const [onDate, setOnDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const split = types.find(ty => ty.id === typeId)?.split ?? false;
  return (
    <form className="balance-form" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const result = mode === "adjust"
          ? await adjustBalance({ memberId, typeId, days, reason, ...(split ? { bucket } : {}) })
          : await setBalance({ memberId, typeId, days, onDate, reason, ...(split ? { earning } : {}) });
        if (!result.ok) {
          setError(format(t.errors[result.error as ErrorCode], result.values));
          return;
        }
        setDays("");
        setEarning("");
        setReason("");
        toast({ id: "saved", text: t.team.saved });
        router.refresh();
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
            <DateField id="bf-on" label={t.team.onDate} value={onDate || null} onChange={v => setOnDate(v ?? "")} today={today} required labels={t.date} />
          </div>
        )}
        <div className="field-group grow">
          <label className="field-label" htmlFor="bf-reason">{t.team.reason}</label>
          <input id="bf-reason" className="field" required={mode === "adjust"} maxLength={300} placeholder={t.team.reasonPlaceholder} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <button type="submit" className="button" disabled={pending}>{t.team.save}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
