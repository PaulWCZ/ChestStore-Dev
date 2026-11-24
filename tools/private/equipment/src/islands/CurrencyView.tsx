import { call, toast } from "@argentic/chest-app/client";
import { useState, useTransition } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";

type Words = { settings: Catalogue["settings"] };

// The tool's default currency (SDK 0.7.0: the Chest has none): it fills
// the currency of a new price or cost; the amounts already written keep
// theirs — but for those written before 0.7.0, taken as euros until a
// manager saves a currency (guessed: they then take it, migrations/0010).
export function CurrencyView({ currency, guessed, currencies, t }: { currency: string; guessed: boolean; currencies: string[]; t: Words }) {
  const [code, setCode] = useState(currency);
  const [saved, setSaved] = useState(currency);
  const [unsure, setUnsure] = useState(guessed);
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
        toast(format(unsure ? w.currencyMoved : w.currencySaved, { currency: code }));
        setUnsure(false);
      });
    }}>
      <h2 id="currency-title">{w.currencyTitle}</h2>
      <p className="small muted" id="currency-intro">{w.currencyIntro}</p>
      {unsure && <p className="small" id="currency-guessed">{w.currencyGuessed}</p>}
      <div className="row">
        <label className="visually-hidden" htmlFor="currency-code">{w.currencyTitle}</label>
        <select id="currency-code" className="field" value={code} onChange={e => setCode(e.target.value)} aria-describedby={unsure ? "currency-intro currency-guessed" : "currency-intro"}>
          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" className="button" disabled={pending || (code === saved && !unsure)}>{w.currencySave}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
