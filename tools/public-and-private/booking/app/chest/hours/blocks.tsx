"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, CalendarOff } from "../../../components/icons.tsx";
import { TimeSelect } from "../../../components/time-select.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { blockTime, unblock } from "../actions.ts";

type Words = { hours: Catalogue["hours"]; errors: Catalogue["errors"] };
// label: the day and hours in words, written by the server.
type Block = { id: string; label: string; note: string };

// Times the host blocks by hand — a meeting elsewhere, the dentist — an
// hour at a time, on one day; listed until they are over.
export function Blocks({ list, today, t }: { list: Block[]; today: string; t: Words }) {
  const h = t.hours;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
        start(async () => {
          const r = await blockTime(String(d.get("day") ?? ""), Number(d.get("from")), Number(d.get("to")), String(d.get("note") ?? ""));
          if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
          setError(null);
          toast(h.blockedToast);
          form.reset();
          router.refresh();
        });
      }}>
        <div><label className="label" htmlFor="bl-day">{h.day}</label><input id="bl-day" name="day" type="date" className="field" min={today} defaultValue={today} required /></div>
        <div><label className="label" htmlFor="bl-from">{h.from}</label><TimeSelect id="bl-from" name="from" value={600} /></div>
        <div><label className="label" htmlFor="bl-to">{h.to}</label><TimeSelect id="bl-to" name="to" value={660} end /></div>
        <div className="grow"><label className="label" htmlFor="bl-note">{h.note}</label><input id="bl-note" name="note" className="field" maxLength={80} /></div>
        <div><button type="submit" className="button soft" disabled={pending}>{h.blockButton}</button></div>
      </form>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </section>
  );
}
