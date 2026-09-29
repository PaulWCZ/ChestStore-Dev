"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Check, Close, Moved } from "../../../components/icons.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { connectCalendar, disconnectCalendar, readCalendars } from "../actions.ts";

type Words = { others: Catalogue["others"]; errors: Catalogue["errors"] };
// read, tried: when, in words (written by the server).
type Other = { id: string; provider: string; hint: string; events: number; error: keyof Catalogue["others"]["failures"] | null; stale: boolean; read: string | null; tried: string | null };

// The host's other calendars: paste a secret iCal address, see when each
// was last read, read them again, disconnect one (inside the Hours page's
// fold).
export function OtherCalendars({ list, locale, t }: { list: Other[]; locale: string; t: Words }) {
  const o = t.others;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <p className="hint">{o.hint}</p>
      {list.length > 0 && (
        <ul className="calendars">
          {list.map(c => (
            <li key={c.id} className={c.error ? "failing" : ""}>
              <span className="stack-xs">
                <strong>{c.provider}</strong>
                <span className="muted small">{c.hint}</span>
                {c.error
                  ? <span className="error small"><Alert />{format(o.failures[c.error], { when: c.tried ?? "" })}</span>
                  : <span className="small">{c.read ? <><Check /> {format(o.read, { when: c.read })} · {plural(o.events, c.events, locale)}</> : o.never}</span>}
              </span>
              <button type="button" className="icon-button" aria-label={format(o.disconnectLabel, { name: c.provider })} disabled={pending} onClick={() => start(async () => {
                const r = await disconnectCalendar(c.id);
                if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
                router.refresh();
              })}><Close /></button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <div>
          <button type="button" className="button quiet small" disabled={pending} onClick={() => start(async () => {
            const r = await readCalendars();
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            setError(null);
            toast(r.value > 0 ? o.readSome : o.readDone);
            router.refresh();
          })}><Moved />{o.readNow}</button>
        </div>
      )}
      {list.length < 3 && (
        <form className="stack-s" onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget;
          const address = String(new FormData(form).get("address") ?? "");
          start(async () => {
            const r = await connectCalendar(address);
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            setError(null);
            toast(o.connected);
            form.reset();
            router.refresh();
          });
        }}>
          <label className="label" htmlFor="cal-address">{o.address}</label>
          <div className="inline">
            <input id="cal-address" name="address" className="field grow" inputMode="url" autoComplete="off" spellCheck={false} required placeholder={o.placeholder} />
            <button type="submit" className="button soft" disabled={pending}>{o.connect}</button>
          </div>
          <details className="more">
            <summary>{o.how}</summary>
            <ul className="how">
              <li>{o.google}</li>
              <li>{o.outlook}</li>
              <li>{o.apple}</li>
            </ul>
          </details>
        </form>
      )}
      <p className="hint">{o.delay}</p>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </>
  );
}
