import { DateField, TimeSelect } from "@argentic/chest-ui/components";
import { moveEnd, moveStart, timeText, type DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { Alert, CalendarOff, Clock } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import type { Outcome } from "@argentic/chest-app";
import { plural } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

type Words = { hours: Catalogue["hours"]; date: DateWords; invalid: string };
// label: the date in words, written by the server (the browser's Intl may
// write it differently and break hydration).
type Exception = { day: string; label: string; ranges: [number, number][]; note: string };

// The days that differ from the week: days off (one or a holiday), or other
// hours for one day.
export function Exceptions({ list, today, locale, t }: { list: Exception[]; today: string; locale: string; t: Words }) {
  const h = t.hours;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The days off (first, last) and the day of other hours, as ISO dates.
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [special, setSpecial] = useState<string | null>(null);
  const [slot, setSlot] = useState({ start: 600, end: 960 });
  const words = t.date;
  const run = async (step: () => Promise<Outcome<unknown>>, done: (value: unknown) => string | null, form?: HTMLFormElement, clear?: () => void) => {
    setPending(true);
    const r = await step();
    setPending(false);
    if (!r.ok) return setError(r.message);
    setError(null);
    const text = done(r.value);
    if (text) toast(text);
    form?.reset();
    clear?.();
  };
  return (
    <>
      <p className="hint">{h.exceptionsHint}</p>
      {list.length === 0 ? <p className="muted">{h.none}</p> : (
        <ul className="exceptions">
          {list.map(x => (
            <li key={x.day}>
              <span className="row">
                {x.ranges.length === 0 ? <span className="tag danger"><CalendarOff />{h.dayOff}</span> : <span className="tag free"><Clock />{x.ranges.map(r => `${timeText(r[0])}–${timeText(r[1])}`).join(", ")}</span>}
                <strong>{x.label}</strong>
                {x.note && <span className="muted">{x.note}</span>}
              </span>
              <button type="button" className="link-button" disabled={pending} onClick={() => void run(() => call("removeException", { day: x.day }, { quiet: true }), () => null)}>{h.undo}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid-2">
        <form className="stack-s" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          if (!first) return setError(t.invalid);
          void run(() => call("addDaysOff", { from: first, to: last ?? first, note: String(d.get("note") ?? "") }, { quiet: true }), n => plural(h.addedOff, Number(n), locale), form, () => { setFirst(null); setLast(null); });
        }}>
          <h3>{h.holiday}</h3>
          <div className="inline">
            <DateField id="off-from" label={h.first} value={first} onChange={d => { setFirst(d); if (d && last && last < d) setLast(null); }} today={today} min={today} required labels={words} />
            <DateField id="off-to" label={h.last} value={last} onChange={setLast} today={today} min={first ?? today} chips={false} labels={words} />
          </div>
          <div><label className="label" htmlFor="off-note">{h.note}</label><input id="off-note" name="note" className="field" maxLength={80} /></div>
          <div><button type="submit" className="button soft" disabled={pending}>{h.addOff}</button></div>
        </form>
        <form className="stack-s" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          if (!special || slot.start >= slot.end) return setError(t.invalid);
          void run(() => call("addSpecialDay", { day: special, ranges: [[slot.start, slot.end]], note: String(d.get("note") ?? "") }, { quiet: true }), () => null, form, () => setSpecial(null));
        }}>
          <h3>{h.special}</h3>
          <DateField id="sp-day" label={h.day} value={special} onChange={setSpecial} today={today} min={today} required labels={words} />
          <div className="inline">
            <div><label className="label" htmlFor="sp-start">{h.from}</label><TimeSelect id="sp-start" value={slot.start} onChange={s => setSlot(moveStart(slot, s))} /></div>
            <div><label className="label" htmlFor="sp-end">{h.to}</label><TimeSelect id="sp-end" value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end /></div>
          </div>
          <div><label className="label" htmlFor="sp-note">{h.note}</label><input id="sp-note" name="note" className="field" maxLength={80} /></div>
          <div><button type="submit" className="button soft" disabled={pending}>{h.addSpecial}</button></div>
        </form>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
