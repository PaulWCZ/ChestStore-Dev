import { call, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";

type Words = { settings: Catalogue["settings"] };

// The tool's default currency (SDK 0.7.0: the Chest has none): it fills
// the currency of a new price or cost; the amounts already written keep
// theirs.
export function CurrencyView({ currency, currencies, t }: { currency: string; currencies: string[]; t: Words }) {
  const [code, setCode] = useState(currency);
  const [saved, setSaved] = useState(currency);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const w = t.settings;
  return (
    <form className="summary-box currency-form" aria-labelledby="currency-title" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await call("setCurrency", { currency: code }, { quiet: true });
        if (!r.ok) return setError(r.message);
        setSaved(code);
        toast(format(w.currencySaved, { currency: code }));
      });
    }}>
      <h2 id="currency-title">{w.currencyTitle}</h2>
      <p className="small muted" id="currency-intro">{w.currencyIntro}</p>
      <div className="row">
        <label className="visually-hidden" htmlFor="currency-code">{w.currencyTitle}</label>
        <select id="currency-code" className="field" value={code} onChange={e => setCode(e.target.value)} aria-describedby="currency-intro">
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" className="button" disabled={pending || code === saved}>{w.currencySave}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
