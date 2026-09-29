"use client";

import { useState, useTransition } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { rate } from "../../public-actions.ts";

// "Did we solve your problem?" — one click, once the request is closed;
// the customer may change their mind.
export function Rate({ secret, rating, t }: { secret: string; rating: "good" | "bad" | null; t: Catalogue["public"] }) {
  const [chosen, setChosen] = useState(rating);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const choose = (value: "good" | "bad") => start(async () => {
    const r = await rate(secret, value);
    if (r.ok) {
      setChosen(value);
      setDone(true);
    }
  });
  return (
    <section className="rate" aria-labelledby="rate-title">
      <h2 id="rate-title">{t.rateTitle}</h2>
      <div className="row">
        <button type="button" className={`button ${chosen === "good" ? "" : "quiet"}`} aria-pressed={chosen === "good"} disabled={pending} onClick={() => choose("good")}>{t.rateGood}</button>
        <button type="button" className={`button ${chosen === "bad" ? "" : "quiet"}`} aria-pressed={chosen === "bad"} disabled={pending} onClick={() => choose("bad")}>{t.rateBad}</button>
      </div>
      {done && <p role="status" className="muted">{t.rated}</p>}
    </section>
  );
}
