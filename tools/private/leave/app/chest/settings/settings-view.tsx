"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Result } from "../../../lib/errors.ts";
import { archiveType, saveSettings, saveType } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };
type Rules = { counting: "ouvres" | "ouvrables"; alsace: boolean; workedHolidays: string[]; periodStartMonth: number };
export type TypeRow = {
  id: string; key: string | null; name: string; builtIn: string; color: string; balance: boolean; perYear: number; halfDays: boolean; counting: "company" | "worked" | "calendar";
  approval: boolean; notes: boolean; archived: boolean; period: "running" | "acquired" | "yearly"; periodMonth: number | null; unused: "carry" | "lose"; overdraw: boolean; away: boolean;
};

export function SettingsView(props: { settings: Rules; holidays: { key: string; name: string; day: string; alsace: boolean }[]; months: { value: number; name: string }[]; types: TypeRow[]; colors: { key: string; name: string }[]; t: Words }) {
  const { t } = props;
  const router = useRouter();
  const toast = useToast();
  const [rules, setRules] = useState(props.settings);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const companyMonth = format(t.settings.companyMonth, { month: props.months.find(m => m.value === rules.periodStartMonth)?.name ?? "" });

  function save(next: Rules) {
    const before = rules;
    setRules(next);
    start(async () => {
      const result = await saveSettings(next);
      if (!result.ok) {
        setRules(before);
        toast(format(t.errors[result.error as ErrorCode], result.values));
      } else toast(t.settings.saved);
      router.refresh();
    });
  }

  return (
    <div className="settings">
      <section className="panel">
        <h2>{t.settings.counting}</h2>
        <div className="choices">
          {(["ouvres", "ouvrables"] as const).map(c => (
            <label key={c} className={`choice${rules.counting === c ? " chosen" : ""}`}>
              <input type="radio" name="counting" checked={rules.counting === c} onChange={() => save({ ...rules, counting: c })} />
              <span><strong>{t.settings[c]}</strong><span className="muted small">{c === "ouvres" ? t.settings.ouvresHint : t.settings.ouvrablesHint}</span></span>
            </label>
          ))}
        </div>
        <p className="hint">{t.settings.countingWarning}</p>
      </section>

      <section className="panel">
        <h2>{t.settings.holidays}</h2>
        <label className="check">
          <input type="checkbox" checked={rules.alsace} onChange={e => save({ ...rules, alsace: e.target.checked })} />
          <span>{t.settings.alsace}</span>
        </label>
        <p className="muted small">{t.settings.workedHint}</p>
        <ul className="holiday-list">
          {props.holidays.filter(h => rules.alsace || !h.alsace).map(h => (
            <li key={h.key}>
              <span><strong>{h.name}</strong> <span className="muted small">{h.day}</span></span>
              <label className="check small">
                <input type="checkbox" checked={rules.workedHolidays.includes(h.key)} onChange={e => save({ ...rules, workedHolidays: e.target.checked ? [...rules.workedHolidays, h.key] : rules.workedHolidays.filter(k => k !== h.key) })} />
                <span>{t.settings.worked}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2><label htmlFor="period">{t.settings.period}</label></h2>
        <select id="period" className="field compact" value={rules.periodStartMonth} onChange={e => save({ ...rules, periodStartMonth: Number(e.target.value) })}>
          {props.months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
        </select>
        <p className="muted small">{t.settings.periodHint}</p>
      </section>

      <section className="panel">
        <h2>{t.settings.types}</h2>
        <ul className="type-list">
          {props.types.map(ty => <TypeEditor key={ty.id} row={ty} colors={props.colors} months={props.months} companyMonth={companyMonth} t={t} />)}
          {adding && (
            <TypeEditor
              row={{ id: "", key: null, name: "", builtIn: "", color: "lilac", balance: false, perYear: 0, halfDays: true, counting: "company", approval: true, notes: true, archived: false, period: "running", periodMonth: null, unused: "carry", overdraw: true, away: true }}
              colors={props.colors} months={props.months} companyMonth={companyMonth} t={t} onDone={() => setAdding(false)}
            />
          )}
        </ul>
        {!adding && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{t.settings.addType}</button>}
      </section>
    </div>
  );
}

// A kind of leave. An existing one is saved as each field changes (a text
// when it is left), with a toast: nothing waits for a button, nothing is
// lost when the page is left. A new one is added with its button.
function TypeEditor({ row, colors, months, companyMonth, t, onDone }: { row: TypeRow; colors: { key: string; name: string }[]; months: { value: number; name: string }[]; companyMonth: string; t: Words; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(row);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idp = row.id || "new";
  const fresh = !row.id;
  const run = (step: () => Promise<Result<unknown>>, undo?: () => void) => start(async () => {
    setError(null);
    const result = await step();
    if (!result.ok) {
      undo?.();
      setError(format(t.errors[result.error as ErrorCode], result.values));
      return;
    }
    toast(t.settings.saved);
    onDone?.();
    router.refresh();
  });
  const input = (x: TypeRow) => ({
    name: x.name, color: x.color, balance: x.balance, perYear: x.balance ? String(x.perYear) : "0", halfDays: x.halfDays, counting: x.counting, approval: x.approval, notes: x.notes,
    period: x.balance ? x.period : "running", periodMonth: x.periodMonth, unused: x.unused, overdraw: x.overdraw, away: x.away,
  });
  // change: the new value at once; saved now for an existing kind.
  const change = (patch: Partial<TypeRow>, now = true) => {
    const before = v;
    const next = { ...v, ...patch };
    setV(next);
    if (!fresh && now) run(() => saveType(row.id, input(next)), () => setV(before));
  };
  const leave = () => {
    if (!fresh && (v.name !== row.name || v.perYear !== row.perYear)) run(() => saveType(row.id, input(v)));
  };
  const flag = (key: "balance" | "halfDays" | "approval" | "notes" | "overdraw" | "away", label: string) => (
    <label className="check small">
      <input type="checkbox" checked={v[key]} disabled={pending} onChange={e => change({ [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <li className={`type-editor${row.archived ? " archived" : ""}`}>
      <form onSubmit={e => {
        e.preventDefault();
        if (fresh) run(() => saveType(null, input(v)));
        else leave();
      }}>
        <div className="form-row">
          <span className={`dot k-${v.color}`} aria-hidden="true" />
          <div className="field-group grow">
            <label className="field-label" htmlFor={`name-${idp}`}>{t.settings.name}</label>
            <input id={`name-${idp}`} className="field" maxLength={40} required={!row.key} placeholder={row.builtIn || undefined} value={v.name} onChange={e => change({ name: e.target.value }, false)} onBlur={leave} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`color-${idp}`}>{t.settings.color}</label>
            <select id={`color-${idp}`} className="field" value={v.color} disabled={pending} onChange={e => change({ color: e.target.value })}>
              {colors.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`counting-${idp}`}>{t.settings.countedIn}</label>
            <select id={`counting-${idp}`} className="field" value={v.counting} disabled={pending} onChange={e => change({ counting: e.target.value === "calendar" ? "calendar" : e.target.value === "worked" ? "worked" : "company" })}>
              <option value="company">{t.settings.company}</option>
              <option value="worked">{t.settings.worked_}</option>
              <option value="calendar">{t.settings.calendar}</option>
            </select>
          </div>
        </div>
        <div className="flags">
          {flag("balance", t.settings.balance)}
          {v.balance && (
            <span className="per-year">
              <label htmlFor={`per-${idp}`}>{t.settings.perYear}</label>
              <input id={`per-${idp}`} className="field compact" inputMode="decimal" value={String(v.perYear)} onChange={e => change({ perYear: Number(e.target.value.replace(",", ".")) || 0 }, false)} onBlur={leave} />
            </span>
          )}
          {flag("halfDays", t.settings.halfDays)}
          {flag("approval", t.settings.approval)}
          {flag("notes", t.settings.notes)}
          {flag("away", t.settings.away)}
          {v.balance && flag("overdraw", t.settings.overdraw)}
        </div>
        {v.balance && (
          <div className="form-row year-row">
            <div className="field-group">
              <label className="field-label" htmlFor={`period-${idp}`}>{t.settings.year}</label>
              <select id={`period-${idp}`} className="field" value={v.period} disabled={pending} onChange={e => change({ period: e.target.value === "acquired" ? "acquired" : e.target.value === "yearly" ? "yearly" : "running" })}>
                <option value="acquired">{t.settings.periodAcquired}</option>
                <option value="yearly">{t.settings.periodYearly}</option>
                <option value="running">{t.settings.periodRunning}</option>
              </select>
            </div>
            {v.period !== "running" && (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor={`month-${idp}`}>{t.settings.yearStarts}</label>
                  <select id={`month-${idp}`} className="field" value={v.periodMonth ?? 0} disabled={pending} onChange={e => change({ periodMonth: Number(e.target.value) || null })}>
                    <option value={0}>{companyMonth}</option>
                    {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`unused-${idp}`}>{t.settings.unused}</label>
                  <select id={`unused-${idp}`} className="field" value={v.unused} disabled={pending} onChange={e => change({ unused: e.target.value === "lose" ? "lose" : "carry" })}>
                    <option value="carry">{t.settings.carry}</option>
                    <option value="lose">{t.settings.lose}</option>
                  </select>
                </div>
              </>
            )}
          </div>
        )}
        {v.balance && v.period !== "running" && <p className="muted small">{v.period === "acquired" ? t.settings.periodAcquiredHint : t.settings.periodYearlyHint} {v.unused === "lose" ? t.settings.loseHint : t.settings.carryHint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card-actions">
          {fresh && <button type="submit" className="button small" disabled={pending}>{t.settings.add}</button>}
          {!fresh && <button type="button" className="button quiet small" disabled={pending} onClick={() => run(() => archiveType(row.id, !row.archived))}>{row.archived ? t.settings.restore : t.settings.archive}</button>}
          {row.archived && <span className="status s-cancelled">{t.settings.archived}</span>}
        </div>
      </form>
    </li>
  );
}
