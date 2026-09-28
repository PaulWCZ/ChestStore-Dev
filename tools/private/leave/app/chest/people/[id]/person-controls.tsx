"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { adjustBalance, setBalance, setStartDate } from "../../actions.ts";

type Words = { team: Catalogue["team"]; errors: Catalogue["errors"] };

// Since when someone earns leave: saved when it changes.
export function StartDate({ memberId, value, max, t }: { memberId: string; value: string; max: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="field-group">
      <label className="field-label" htmlFor="start-date">{t.team.startDate}</label>
      <input id="start-date" className="field compact" type="date" max={max} defaultValue={value} disabled={pending} onChange={e => {
        const next = e.target.value;
        start(async () => {
          const result = await setStartDate(memberId, next || null);
          toast(result.ok ? t.team.saved : format(t.errors[result.error as ErrorCode], result.values));
          router.refresh();
        });
      }} />
    </div>
  );
}

// HR's two balance tools: add or remove days (with a reason), or state the
// balance as it is on a day.
export function BalanceForms({ memberId, types, today, t }: { memberId: string; types: { id: string; name: string }[]; today: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [onDate, setOnDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="balance-form" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const result = mode === "adjust" ? await adjustBalance({ memberId, typeId, days, reason }) : await setBalance({ memberId, typeId, days, onDate, reason });
        if (!result.ok) {
          setError(format(t.errors[result.error as ErrorCode], result.values));
          return;
        }
        setDays("");
        setReason("");
        toast(t.team.saved);
        router.refresh();
      });
    }}>
      <div className="segmented" role="radiogroup" aria-label={t.team.balances}>
        <button type="button" role="radio" aria-checked={mode === "adjust"} onClick={() => setMode("adjust")}>{t.team.adjust}</button>
        <button type="button" role="radio" aria-checked={mode === "set"} onClick={() => setMode("set")}>{t.team.setBalance}</button>
      </div>
      <p className="muted small">{mode === "adjust" ? t.team.adjustHint : t.team.setBalanceHint}</p>
      <div className="form-row">
        <div className="field-group">
          <label className="field-label" htmlFor="bf-type">{t.team.type}</label>
          <select id="bf-type" className="field" value={typeId} onChange={e => setTypeId(e.target.value)}>
            {types.map(ty => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
          </select>
        </div>
        <div className="field-group short">
          <label className="field-label" htmlFor="bf-days">{t.team.days}</label>
          <input id="bf-days" className="field" inputMode="decimal" required value={days} onChange={e => setDays(e.target.value)} />
        </div>
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
