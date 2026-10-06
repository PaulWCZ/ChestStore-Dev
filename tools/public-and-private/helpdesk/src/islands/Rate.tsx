import { call } from "@argentic/chest-app/client";
import { useState } from "react";
import type { Catalogue } from "../i18n/index.ts";

// "Did we solve your problem?" — one click, once the request is closed;
// the customer may change their mind. On the follow-up page (secret: the
// link's) or on a colleague's own request in My requests (number).
type Words = Pick<Catalogue["public"], "rateTitle" | "rateGood" | "rateBad" | "rated">;

export function Rate({ secret, number, rating, team, t }: { secret?: string; number?: number; rating: "good" | "bad" | null; team?: boolean; t: Words }) {
  const [chosen, setChosen] = useState(rating);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  async function choose(value: "good" | "bad") {
    setPending(true);
    const r = number !== undefined ? await call("rateMine", { number, value }, { refresh: false }) : await call("rate", { secret: secret ?? "", value }, { refresh: false });
    setPending(false);
    if (r.ok) {
      setChosen(value);
      setDone(true);
    }
  }
  const quiet = team ? "ck-button ck-button-quiet" : "button quiet";
  const strong = team ? "ck-button" : "button";
  const good = chosen === "good", bad = chosen === "bad";
  return (
    <section className="rate" aria-labelledby="rate-title">
      <h2 id="rate-title">{t.rateTitle}</h2>
      <div className="row">
        <button type="button" className={good ? strong : quiet} aria-pressed={good} disabled={pending} onClick={() => void choose("good")}>{t.rateGood}</button>
        <button type="button" className={bad ? strong : quiet} aria-pressed={bad} disabled={pending} onClick={() => void choose("bad")}>{t.rateBad}</button>
      </div>
      {done && <p role="status" className="muted">{t.rated}</p>}
    </section>
  );
}
