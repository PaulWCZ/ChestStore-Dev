"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Result } from "../../../../lib/errors.ts";
import { adjustBalance, setBalance, setEmployeeNumber, setEndDate, setStartDate, setWorkDays } from "../../actions.ts";

type Words = { team: Catalogue["team"]; errors: Catalogue["errors"] };

// Saves one of a person's fields as soon as it changes, with a toast.
function useSave(t: Words) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const save = (step: () => Promise<Result<null>>, undo?: () => void) => start(async () => {
    const result = await step();
    if (!result.ok) undo?.();
    toast(result.ok ? t.team.saved : format(t.errors[result.error as ErrorCode], result.values));
    router.refresh();
  });
  return { pending, save };
}

// The start date (since when leave is earned) or the last day (nothing is
// earned after it): saved when it changes; empty clears it.
export function DayField({ kind, memberId, value, label, t }: { kind: "start" | "end"; memberId: string; value: string; label: string; t: Words }) {
  const { pending, save } = useSave(t);
  const idp = `${kind}-date`;
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={idp}>{label}</label>
      <input id={idp} className="field compact" type="date" defaultValue={value} disabled={pending} onChange={e => {
        const next = e.target.value || null;
        save(() => (kind === "start" ? setStartDate(memberId, next) : setEndDate(memberId, next)));
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
        toast(t.team.saved);
        router.refresh();
      });
    }}>
      <div className="segmented" role="radiogroup" aria-label={t.team.balances}>
        <button type="button" role="radio" aria-checked={mode === "adjust"} onClick={() => setMode("adjust")}>{t.team.adjust}</button>
        <button type="button" role="radio" aria-checked={mode === "set"} onClick={() => setMode("set")}>{t.team.setBalance}</button>
      </div>
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
          <div className="field-group">
            <label className="field-label" htmlFor="bf-on">{t.team.onDate}</label>
            <input id="bf-on" className="field" type="date" required value={onDate} onChange={e => setOnDate(e.target.value)} />
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
