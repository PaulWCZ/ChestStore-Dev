import { call, fill, plural, toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Box } from "../components/box.tsx";
import { Bin } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Settings: erasing a customer's data — their right to erasure. For good:
// asked first, in the page's own dialog (never the browser's); who erased
// how many tickets, and when, is listed — never whose.
export function EraseBox({ erasures, locale, t }: { erasures: string[]; locale: string; t: Catalogue["settings"] }) {
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [erasing, setErasing] = useState(false);
  async function erase() {
    setErasing(true);
    const r = await call("eraseCustomer", { email });
    setErasing(false);
    setAsking(false);
    if (!r.ok) return;
    toast(plural(locale, t.erased, r.value.tickets));
    setEmail("");
  }
  return (
    <Box title={t.erase} icon={<Bin />}>
      <p className="hint">{t.eraseHint}</p>
      <form className="row" onSubmit={e => { e.preventDefault(); setAsking(true); }}>
        <label className="visually-hidden" htmlFor="erase">{t.erase}</label>
        <input id="erase" type="email" className="field grow" value={email} onChange={e => setEmail(e.target.value)} required />
        <button type="submit" className="button danger">{t.eraseButton}</button>
      </form>
      <Confirm open={asking} title={t.eraseTitle} body={fill(t.eraseBody, { email: email.trim() })} confirmLabel={t.eraseButton} cancelLabel={t.cancel}
        busy={erasing} onConfirm={() => void erase()} onCancel={() => setAsking(false)} />
      {erasures.length > 0 && (
        <div className="stack">
          <h3>{t.erasures}</h3>
          <ul className="small muted">{erasures.map((line, i) => <li key={i}>{line}</li>)}</ul>
        </div>
      )}
    </Box>
  );
}
