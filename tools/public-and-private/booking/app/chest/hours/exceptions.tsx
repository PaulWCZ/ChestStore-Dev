"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, CalendarOff, Clock } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { TimeSelect } from "../../../components/time-select.tsx";
import { toTime } from "../../../lib/clock.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addDaysOff, addSpecialDay, removeException } from "../actions.ts";

type Words = { hours: Catalogue["hours"]; days: Catalogue["days"]; errors: Catalogue["errors"] };
// label: the date in words, written by the server (the browser's Intl may
// write it differently and break hydration).
type Exception = { day: string; label: string; ranges: [number, number][]; note: string };

// The days that differ from the week: days off (one or a holiday), or other
// hours for one day.
export function Exceptions({ list, today, locale, t }: { list: Exception[]; today: string; locale: string; t: Words }) {
  const h = t.hours;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const run = (step: () => Promise<{ ok: true; value: unknown } | { ok: false; error: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done: (value: unknown) => string | null, form?: HTMLFormElement) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      setError(null);
      const text = done(r.value);
      if (text) toast(text);
      form?.reset();
      router.refresh();
    });
  return (
    <section className="card stack" aria-labelledby="exceptions">
      <div>
        <h2 id="exceptions">{h.exceptions}</h2>
        <p className="hint">{h.exceptionsHint}</p>
      </div>
      {list.length === 0 ? <p className="muted">{h.none}</p> : (
        <ul className="exceptions">
          {list.map(x => (
            <li key={x.day}>
              <span className="row">
                {x.ranges.length === 0 ? <span className="tag danger"><CalendarOff />{h.dayOff}</span> : <span className="tag free"><Clock />{x.ranges.map(r => `${toTime(r[0])}–${toTime(r[1])}`).join(", ")}</span>}
                <strong>{x.label}</strong>
                {x.note && <span className="muted">{x.note}</span>}
              </span>
              <button type="button" className="link-button" disabled={pending} onClick={() => run(() => removeException(x.day), () => null)}>{h.undo}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid-2">
        <form className="stack-s" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          const from = String(d.get("from") ?? "");
          run(() => addDaysOff(from, String(d.get("to") || from), String(d.get("note") ?? "")), n => plural(h.addedOff, Number(n), locale), form);
        }}>
          <h3>{h.holiday}</h3>
          <div className="inline">
            <div><label className="label" htmlFor="off-from">{h.first}</label><input id="off-from" name="from" type="date" className="field" min={today} required /></div>
            <div><label className="label" htmlFor="off-to">{h.last}</label><input id="off-to" name="to" type="date" className="field" min={today} /></div>
          </div>
          <div><label className="label" htmlFor="off-note">{h.note}</label><input id="off-note" name="note" className="field" maxLength={80} /></div>
          <div><button type="submit" className="button soft" disabled={pending}>{h.addOff}</button></div>
        </form>
        <form className="stack-s" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          const s = Number(d.get("start")), en = Number(d.get("end"));
          if (!Number.isInteger(s) || !Number.isInteger(en) || s >= en) return setError(t.errors.invalid);
          run(() => addSpecialDay(String(d.get("day") ?? ""), [[s, en]], String(d.get("note") ?? "")), () => null, form);
        }}>
          <h3>{h.special}</h3>
          <div><label className="label" htmlFor="sp-day">{h.day}</label><input id="sp-day" name="day" type="date" className="field" min={today} required /></div>
          <div className="inline">
            <div><label className="label" htmlFor="sp-start">{h.from}</label><TimeSelect id="sp-start" name="start" value={600} /></div>
            <div><label className="label" htmlFor="sp-end">{h.to}</label><TimeSelect id="sp-end" name="end" value={960} end /></div>
          </div>
          <div><label className="label" htmlFor="sp-note">{h.note}</label><input id="sp-note" name="note" className="field" maxLength={80} /></div>
          <div><button type="submit" className="button soft" disabled={pending}>{h.addSpecial}</button></div>
        </form>
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </section>
  );
}
