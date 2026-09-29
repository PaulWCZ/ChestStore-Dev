"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, formatDay, formatTime } from "../../../../lib/i18n/format.ts";
import type { Rules } from "../../../../lib/settings.ts";
import { setRules } from "../../actions.ts";

// A Monday, to name the days of the week in the reader's language.
const monday = "2024-01-01";

export function RulesForm({ rules, locale, t }: { rules: Rules; locale: string; t: { rules: Catalogue["rules"]; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [r, setR] = useState(rules);
  const hours = Array.from({ length: 25 }, (_, i) => i * 60);
  function save(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const done = await setRules({ ...r });
      if (!done.ok) return void toast(format(t.errors[done.error], done.values));
      toast(t.rules.saved);
      router.refresh();
    });
  }
  return (
    <form className="panel stack rules" onSubmit={save}>
      <div className="form-grid">
        <label className="span-4 inline-label">
          <span>{t.rules.daysAhead}</span>
          <input className="field narrow-field" type="number" min={1} max={365} value={r.daysAhead} onChange={e => setR({ ...r, daysAhead: Number(e.target.value) || 1 })} />
        </label>
        <label className="span-4 inline-label">
          <span>{t.rules.maxDeskDays}</span>
          <select className="select narrow-field" value={r.maxDeskDays ?? ""} onChange={e => setR({ ...r, maxDeskDays: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t.rules.noLimit}</option>
            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="span-4 inline-label">
          <span>{t.rules.repeatWeeks}</span>
          <input className="field narrow-field" type="number" min={1} max={52} value={r.repeatWeeks} onChange={e => setR({ ...r, repeatWeeks: Number(e.target.value) || 1 })} />
        </label>
      </div>
      <fieldset className="checks">
        <legend className="label">{t.rules.hours}</legend>
        <label className="inline-label">
          <span>{t.rules.from}</span>
          <select className="select narrow-field" value={r.dayStart} onChange={e => setR({ ...r, dayStart: Number(e.target.value) })}>
            {hours.slice(0, -1).map(m => <option key={m} value={m}>{formatTime(m, locale)}</option>)}
          </select>
        </label>
        <label className="inline-label">
          <span>{t.rules.to}</span>
          <select className="select narrow-field" value={r.dayEnd} onChange={e => setR({ ...r, dayEnd: Number(e.target.value) })}>
            {hours.filter(m => m > r.dayStart).map(m => <option key={m} value={m}>{formatTime(m, locale)}</option>)}
          </select>
        </label>
      </fieldset>
      <fieldset className="checks">
        <legend className="label">{t.rules.weekdays}</legend>
        {[1, 2, 3, 4, 5, 6, 7].map(d => {
          const date = new Date(Date.parse(monday + "T00:00:00Z") + (d - 1) * 86400000).toISOString().slice(0, 10);
          return (
            <label key={d} className="check chip-check">
              <input type="checkbox" checked={r.weekdays.includes(d)} onChange={e => setR({ ...r, weekdays: e.target.checked ? [...r.weekdays, d].sort() : r.weekdays.filter(x => x !== d) })} />
              {formatDay(date, locale, { weekday: "long" })}
            </label>
          );
        })}
      </fieldset>
      <label className="inline-label">
        <span>{t.rules.keepMonths}</span>
        <input className="field narrow-field" type="number" min={1} max={60} value={r.keepMonths} onChange={e => setR({ ...r, keepMonths: Number(e.target.value) || 1 })} />
      </label>
      <div className="stack-s">
        <label className="check">
          <input type="checkbox" checked={r.checkIn} onChange={e => setR({ ...r, checkIn: e.target.checked })} />
          {t.rules.checkIn}
        </label>
        <p className="hint">{r.checkIn ? t.rules.checkInHint : t.rules.noCheckIn}</p>
      </div>
      <ul className="hint notes">
        <li>{t.rules.keepHint}</li>
        <li>{t.rules.adminsFree}</li>
      </ul>
      <div><button type="submit" className="button" disabled={pending}>{t.rules.save}</button></div>
    </form>
  );
}
