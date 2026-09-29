"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Calendar } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { confirmHours, connectCalendar } from "./actions.ts";

type Words = { first: Catalogue["first"]; others: Catalogue["others"]; errors: Catalogue["errors"] };

// A new host's first screen: their page is not public yet. First, the one
// thing that prevents double bookings — their calendar; or, with no
// calendar to connect, their hours confirmed. Either makes the page
// public; nothing is shared before.
export function FirstRun({ t }: { t: Words }) {
  const f = t.first;
  const o = t.others;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const done = (text: string) => {
    setError(null);
    toast(text);
    router.refresh();
  };
  return (
    <section className="first-run card stack" aria-labelledby="first-title">
      <div className="stack-xs">
        <h2 id="first-title"><Calendar />{f.title}</h2>
        <p>{f.body}</p>
      </div>
      <form className="stack-s" onSubmit={e => {
        e.preventDefault();
        const address = String(new FormData(e.currentTarget).get("address") ?? "");
        start(async () => {
          const r = await connectCalendar(address);
          if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
          done(f.connected);
        });
      }}>
        <label className="label" htmlFor="first-address">{f.address}</label>
        <div className="inline">
          <input id="first-address" name="address" className="field grow" inputMode="url" autoComplete="off" spellCheck={false} required placeholder={o.placeholder} aria-describedby="first-hint" />
          <button type="submit" className="button" disabled={pending}>{o.connect}</button>
        </div>
        <p id="first-hint" className="hint">{f.addressHint}</p>
        <details className="more">
          <summary>{o.how}</summary>
          <ul className="how">
            <li>{o.google}</li>
            <li>{o.outlook}</li>
            <li>{o.apple}</li>
          </ul>
        </details>
      </form>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="first-or stack-s">
        <p className="hint">{f.noCalendar}</p>
        <div className="row">
          <a className="button quiet small" href="/chest/hours">{f.checkHours}</a>
          <button type="button" className="button quiet small" disabled={pending} onClick={() => start(async () => {
            const r = await confirmHours();
            if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
            done(f.public);
          })}>{f.hoursRight}</button>
        </div>
      </div>
    </section>
  );
}
