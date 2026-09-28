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
export type TypeRow = { id: string; key: string | null; name: string; builtIn: string; color: string; balance: boolean; perYear: number; halfDays: boolean; counting: "company" | "calendar"; approval: boolean; notes: boolean; archived: boolean };

export function SettingsView(props: { settings: Rules; holidays: { key: string; name: string; day: string; alsace: boolean }[]; months: { value: number; name: string }[]; types: TypeRow[]; colors: { key: string; name: string }[]; t: Words }) {
  const { t } = props;
  const router = useRouter();
  const toast = useToast();
  const [rules, setRules] = useState(props.settings);
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);

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
          {props.types.map(ty => <TypeEditor key={ty.id} row={ty} colors={props.colors} t={t} />)}
          {adding && <TypeEditor row={{ id: "", key: null, name: "", builtIn: "", color: "lilac", balance: false, perYear: 0, halfDays: true, counting: "company", approval: true, notes: true, archived: false }} colors={props.colors} t={t} onDone={() => setAdding(false)} />}
        </ul>
        {!adding && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{t.settings.addType}</button>}
      </section>
    </div>
  );
}

function TypeEditor({ row, colors, t, onDone }: { row: TypeRow; colors: { key: string; name: string }[]; t: Words; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(row);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idp = row.id || "new";
  const run = (step: () => Promise<Result<unknown>>) => start(async () => {
    setError(null);
    const result = await step();
    if (!result.ok) {
      setError(format(t.errors[result.error as ErrorCode], result.values));
      return;
    }
    toast(t.settings.saved);
    onDone?.();
    router.refresh();
  });
  const flag = (key: "balance" | "halfDays" | "approval" | "notes", label: string) => (
    <label className="check small">
      <input type="checkbox" checked={v[key]} onChange={e => setV({ ...v, [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <li className={`type-editor${row.archived ? " archived" : ""}`}>
      <form onSubmit={e => {
        e.preventDefault();
        run(() => saveType(row.id || null, { name: v.name, color: v.color, balance: v.balance, perYear: v.balance ? String(v.perYear) : "0", halfDays: v.halfDays, counting: v.counting, approval: v.approval, notes: v.notes }));
      }}>
        <div className="form-row">
          <span className={`dot k-${v.color}`} aria-hidden="true" />
          <div className="field-group grow">
            <label className="field-label" htmlFor={`name-${idp}`}>{t.settings.name}</label>
            <input id={`name-${idp}`} className="field" maxLength={40} required={!row.key} placeholder={row.builtIn || undefined} value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`color-${idp}`}>{t.settings.color}</label>
            <select id={`color-${idp}`} className="field" value={v.color} onChange={e => setV({ ...v, color: e.target.value })}>
              {colors.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor={`counting-${idp}`}>{t.settings.countedIn}</label>
            <select id={`counting-${idp}`} className="field" value={v.counting} onChange={e => setV({ ...v, counting: e.target.value === "calendar" ? "calendar" : "company" })}>
              <option value="company">{t.settings.company}</option>
              <option value="calendar">{t.settings.calendar}</option>
            </select>
          </div>
        </div>
        <div className="flags">
          {flag("balance", t.settings.balance)}
          {v.balance && (
            <span className="per-year">
              <label htmlFor={`per-${idp}`}>{t.settings.perYear}</label>
              <input id={`per-${idp}`} className="field compact" inputMode="decimal" value={String(v.perYear)} onChange={e => setV({ ...v, perYear: Number(e.target.value.replace(",", ".")) || 0 })} />
            </span>
          )}
          {flag("halfDays", t.settings.halfDays)}
          {flag("approval", t.settings.approval)}
          {flag("notes", t.settings.notes)}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="card-actions">
          <button type="submit" className="button small" disabled={pending}>{t.settings.save}</button>
          {row.id && <button type="button" className="button quiet small" disabled={pending} onClick={() => run(() => archiveType(row.id, !row.archived))}>{row.archived ? t.settings.restore : t.settings.archive}</button>}
          {row.archived && <span className="status s-cancelled">{t.settings.archived}</span>}
        </div>
      </form>
    </li>
  );
}
