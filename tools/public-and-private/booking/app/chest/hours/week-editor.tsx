"use client";

import { useZones } from "../../../components/use-zones.ts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Close, Globe, Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { TimeSelect } from "../../../components/time-select.tsx";
import { toTime } from "../../../lib/clock.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { validRanges, type Ranges } from "../../../lib/slots.ts";
import { saveWeekly } from "../actions.ts";

type Words = { hours: Catalogue["hours"]; days: Catalogue["days"]; errors: Catalogue["errors"] };
// Monday first, as a week is read in Europe.
const order = [1, 2, 3, 4, 5, 6, 0];

export function WeekEditor({ weekly, zone: initialZone, t }: { weekly: Ranges[]; zone: string; t: Words }) {
  const [week, setWeek] = useState<Ranges[]>(weekly.map(d => d.map(r => [r[0], r[1]] as [number, number])));
  const [zone, setZone] = useState(initialZone);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const zones = useZones(initialZone);
  const h = t.hours;
  const setDay = (day: number, ranges: Ranges) => setWeek(w => w.map((d, i) => (i === day ? ranges : d)));
  const valid = week.every(validRanges);
  return (
    <form className="card stack" onSubmit={e => {
      e.preventDefault();
      if (!valid) return setError(t.errors.invalid);
      start(async () => {
        const r = await saveWeekly(week, zone);
        if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
        setError(null);
        toast(h.saved);
        router.refresh();
      });
    }}>
      <h2>{h.weekly}</h2>
      <ul className="week">
        {order.map(day => {
          const ranges = week[day] ?? [];
          const open = ranges.length > 0;
          const name = t.days.long[day] ?? "";
          return (
            <li key={day}>
              <label className="dayname"><input type="checkbox" checked={open} onChange={e => setDay(day, e.target.checked ? [[540, 1020]] : [])} /><span style={{ textTransform: "capitalize" }}>{name}</span></label>
              {open ? (
                <div className="ranges">
                  {ranges.map((r, i) => (
                    <div className="range" key={i}>
                      <label className="visually-hidden" htmlFor={`f-${day}-${i}`}>{`${name} ${h.from}`}</label>
                      <TimeSelect id={`f-${day}-${i}`} value={r[0]} onChange={m => setDay(day, ranges.map((x, j) => (j === i ? [m, x[1]] : x)))} />
                      <span aria-hidden="true">–</span>
                      <label className="visually-hidden" htmlFor={`t-${day}-${i}`}>{`${name} ${h.to}`}</label>
                      <TimeSelect id={`t-${day}-${i}`} value={r[1]} end onChange={m => setDay(day, ranges.map((x, j) => (j === i ? [x[0], m] : x)))} />
                      <button type="button" className="icon-button" aria-label={`${h.remove} ${toTime(r[0])}–${toTime(r[1])}`} onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}><Close /></button>
                    </div>
                  ))}
                  {ranges.length < 6 && <div><button type="button" className="link-button" onClick={() => { const last = ranges.at(-1)?.[1] ?? 540; const s = Math.min(last + 60, 1380); setDay(day, [...ranges, [s, Math.min(s + 120, 1440)]]); }}><Plus />{h.add}</button></div>}
                  {!validRanges(ranges) && <p className="error"><Alert />{t.errors.invalid}</p>}
                </div>
              ) : <span className="muted" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{h.unavailable}</span>}
            </li>
          );
        })}
      </ul>
      <div>
        <label className="label" htmlFor="zone"><Globe /> {h.zone}</label>
        <select id="zone" className="field" style={{ maxWidth: 360 }} value={zone} onChange={e => setZone(e.target.value)} aria-describedby="zone-hint">
          {zones.map(z => <option key={z} value={z}>{z.replace(/_/gu, " ")}</option>)}
        </select>
        <p id="zone-hint" className="hint">{h.zoneHint}</p>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div><button type="submit" className="button" disabled={pending || !valid}>{h.save}</button></div>
    </form>
  );
}
