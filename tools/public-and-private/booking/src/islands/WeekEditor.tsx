import { TimeSelect } from "@argentic/chest-ui/components";
import { moveEnd, moveStart, timeText } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { Alert, Close, Copy, Globe, Plus } from "../components/icons.tsx";
import { ZoneSelect } from "../components/zone-select.tsx";
import { call, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";
import { validRanges, type Ranges } from "../shared/kinds.ts";
import type { ZoneGroup } from "../shared/zones.ts";

type Words = { hours: Catalogue["hours"]; days: Catalogue["days"]; invalid: string };
// Monday first, as a week is read in Europe.
const order = [1, 2, 3, 4, 5, 6, 0];

const maxima = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

// ready: the page is public already; if not, saving the hours confirms
// them and makes it public (the button says so).
export function WeekEditor({ weekly, zone: initialZone, dailyMax: initialMax, ready = true, zones, t }: { weekly: Ranges[]; zone: string; dailyMax: number; ready?: boolean; zones: ZoneGroup[]; t: Words }) {
  const [week, setWeek] = useState<Ranges[]>(weekly.map(d => d.map(r => [r[0], r[1]] as [number, number])));
  const [zone, setZone] = useState(initialZone);
  const [dailyMax, setDailyMax] = useState(initialMax);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const h = t.hours;
  const setDay = (day: number, ranges: Ranges) => setWeek(w => w.map((d, i) => (i === day ? ranges : d)));
  const valid = week.every(validRanges);
  return (
    <form className="card stack" onSubmit={async e => {
      e.preventDefault();
      if (!valid) return setError(t.invalid);
      setPending(true);
      const r = await call("saveWeekly", { weekly: week, zone, dailyMax }, { quiet: true });
      setPending(false);
      if (!r.ok) return setError(r.message);
      setError(null);
      toast(ready ? h.saved : h.savedPublic);
    }}>
      <h2>{h.weekly}</h2>
      <ul className="week">
        {order.map(day => {
          const ranges = week[day] ?? [];
          const open = ranges.length > 0;
          const name = t.days.long[day] ?? "";
          return (
            <li key={day}>
              <label className="dayname"><input type="checkbox" checked={open} onChange={e => setDay(day, e.target.checked ? [[540, 1020]] : [])} /><span className="capital">{name}</span></label>
              {open ? (
                <div className="ranges">
                  {ranges.map((r, i) => (
                    <div className="range" key={i}>
                      <label className="visually-hidden" htmlFor={`f-${day}-${i}`}>{`${name} ${h.from}`}</label>
                      <TimeSelect id={`f-${day}-${i}`} value={r[0]} onChange={m => setDay(day, ranges.map((x, j) => { if (j !== i) return x; const s = moveStart({ start: x[0], end: x[1] }, m); return [s.start, s.end]; }))} />
                      <span aria-hidden="true">–</span>
                      <label className="visually-hidden" htmlFor={`t-${day}-${i}`}>{`${name} ${h.to}`}</label>
                      <TimeSelect id={`t-${day}-${i}`} value={r[1]} end onChange={m => setDay(day, ranges.map((x, j) => { if (j !== i) return x; const s = moveEnd({ start: x[0], end: x[1] }, m); return [s.start, s.end]; }))} />
                      <button type="button" className="icon-button" aria-label={`${h.remove} ${timeText(r[0])}–${timeText(r[1])}`} onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}><Close /></button>
                    </div>
                  ))}
                  {ranges.length < 6 && (
                    <div className="row">
                      <button type="button" className="link-button" onClick={() => { const last = ranges.at(-1)?.[1] ?? 540; const s = Math.min(last + 60, 1380); setDay(day, [...ranges, [s, Math.min(s + 120, 1440)]]); }}><Plus />{h.add}</button>
                      {day === 1 && <button type="button" className="link-button" onClick={() => setWeek(w => w.map((d, i) => (i >= 1 && i <= 5 ? ranges.map(r => [r[0], r[1]] as [number, number]) : d)))}><Copy />{h.copyMonday}</button>}
                    </div>
                  )}
                  {!validRanges(ranges) && <p className="error"><Alert />{t.invalid}</p>}
                </div>
              ) : <span className="muted unavailable">{h.unavailable}</span>}
            </li>
          );
        })}
      </ul>
      <div>
        <label className="label" htmlFor="zone"><Globe /> {h.zone}</label>
        <ZoneSelect id="zone" className="field wide-select" value={zone} groups={zones} onChange={setZone} describedBy="zone-hint" />
        <p id="zone-hint" className="hint">{h.zoneHint}</p>
      </div>
      <div>
        <label className="label" htmlFor="daily-max">{h.dailyMax}</label>
        <select id="daily-max" className="field short-select" value={dailyMax} onChange={e => setDailyMax(Number(e.target.value))}>
          {[...new Set([...maxima, dailyMax])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n === 0 ? h.noLimit : n}</option>)}
        </select>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div><button type="submit" className="button" disabled={pending || !valid}>{ready ? h.save : h.saveAndPublish}</button></div>
    </form>
  );
}
