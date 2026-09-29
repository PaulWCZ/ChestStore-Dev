"use client";

import { DateField, TimeSelect, useToast } from "@argentic/chest-ui/components";
import { moveEnd, moveStart } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, CalendarOff } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { dateWords } from "../../../lib/i18n/kit.ts";
import { blockTime, unblock } from "../actions.ts";

type Words = { hours: Catalogue["hours"]; errors: Catalogue["errors"]; date: Catalogue["date"] };
// label: the day and hours in words, written by the server.
type Block = { id: string; label: string; note: string };

// Times the host blocks by hand — a meeting elsewhere, the dentist — an
// hour at a time, on one day; listed until they are over.
export function Blocks({ list, today, t }: { list: Block[]; today: string; t: Words }) {
  const h = t.hours;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(today);
  const [slot, setSlot] = useState({ start: 600, end: 660 });
  const toast = useToast();
  const router = useRouter();
  return (
    <section className="card stack" aria-labelledby="blocks">
      <div>
        <h2 id="blocks">{h.blockTitle}</h2>
        <p className="hint">{h.blockHint}</p>
      </div>
      {list.length === 0 ? <p className="muted">{h.noBlocks}</p> : (
        <ul className="blocked-list">
          {list.map(x => (
            <li key={x.id}>
              <span className="row">
                <span className="tag"><CalendarOff />{x.label}</span>
                {x.note && <span className="muted">{x.note}</span>}
              </span>
              <button type="button" className="link-button" disabled={pending} onClick={() => start(async () => {
                const r = await unblock(x.id);
                if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
                router.refresh();
              })}>{h.undo}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="block-form" onSubmit={e => {
        e.preventDefault();
        const form = e.currentTarget;
        const d = new FormData(form);
        if (!day) return setError(t.errors.invalid);
        start(async () => {
          const r = await blockTime(day, slot.start, slot.end, String(d.get("note") ?? ""));
          if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
          setError(null);
          toast(h.blockedToast);
          form.reset();
          router.refresh();
        });
      }}>
        <DateField id="bl-day" label={h.day} value={day} onChange={setDay} today={today} min={today} required labels={dateWords(t)} />
        <div><label className="label" htmlFor="bl-from">{h.from}</label><TimeSelect id="bl-from" value={slot.start} onChange={s => setSlot(moveStart(slot, s))} /></div>
        <div><label className="label" htmlFor="bl-to">{h.to}</label><TimeSelect id="bl-to" value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end /></div>
        <div className="grow"><label className="label" htmlFor="bl-note">{h.note}</label><input id="bl-note" name="note" className="field" maxLength={80} /></div>
        <div><button type="submit" className="button soft" disabled={pending}>{h.blockButton}</button></div>
      </form>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </section>
  );
}
