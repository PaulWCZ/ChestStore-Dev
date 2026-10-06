import { useState } from "react";
import { Alert, Calendar } from "../components/icons.tsx";
import { call, toast } from "../core/client.tsx";
import type { Outcome } from "../core/tool.ts";
import type { Catalogue } from "../i18n/index.ts";

type Words = { first: Catalogue["first"]; others: Catalogue["others"] };

// A new host's first screen: their page is not public yet. First, the one
// thing that prevents double bookings — their calendar; or, with no
// calendar to connect, their hours confirmed. Either makes the page
// public; nothing is shared before. (The page refreshes after each.)
export function FirstRun({ t }: { t: Words }) {
  const f = t.first;
  const o = t.others;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (step: () => Promise<Outcome<unknown>>, done: string) => {
    setPending(true);
    const r = await step();
    setPending(false);
    if (!r.ok) return setError(r.message);
    setError(null);
    toast(done);
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
        void run(() => call("connectCalendar", { address }, { quiet: true }), f.connected);
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
          <button type="button" className="button quiet small" disabled={pending} onClick={() => void run(() => call("confirmHours", {}, { quiet: true }), f.public)}>{f.hoursRight}</button>
        </div>
      </div>
    </section>
  );
}
