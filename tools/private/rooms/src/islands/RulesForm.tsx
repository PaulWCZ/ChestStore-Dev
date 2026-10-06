import { call, toast } from "@argentic/chest-app/client";
import { TimeSelect } from "@argentic/chest-ui/components";
import { useState, type FormEvent } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { formatDay } from "../i18n/format.ts";
import type { Rules } from "../lib/settings.ts";

// A Monday, to name the days of the week in the reader's language.
const monday = "2024-01-01";

export function RulesForm({ rules, locale, t }: { rules: Rules; locale: string; t: { rules: Catalogue["rules"] } }) {
  const [pending, setPending] = useState(false);
  const [r, setR] = useState(rules);
  function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    void call("setRules", { rules: { ...r } }).then(done => {
      setPending(false);
      if (done.ok) toast({ id: "rules", text: t.rules.saved });
    });
  }
  return (
    <form className="panel stack" onSubmit={save}>
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
          <TimeSelect className="narrow-field" value={r.dayStart} step={60} onChange={m => setR({ ...r, dayStart: m, dayEnd: Math.max(r.dayEnd, m + 60) })} />
        </label>
        <label className="inline-label">
          <span>{t.rules.to}</span>
          <TimeSelect className="narrow-field" value={r.dayEnd} step={60} end min={r.dayStart} onChange={m => setR({ ...r, dayEnd: m })} />
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
      <label className="inline-label">
        <span>{t.rules.visitorDays}</span>
        <input className="field narrow-field" type="number" min={1} max={90} value={r.visitorDays} onChange={e => setR({ ...r, visitorDays: Number(e.target.value) || 1 })} />
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
        <li>{t.rules.visitorHint}</li>
        <li>{t.rules.adminsFree}</li>
      </ul>
      <div><button type="submit" className="button" disabled={pending}>{t.rules.save}</button></div>
    </form>
  );
}
