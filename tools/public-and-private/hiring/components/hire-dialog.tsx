"use client";

import { useState } from "react";
import { format } from "../lib/i18n/format.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { Dialog } from "./dialog.tsx";

// Moving someone to "hired": the day they start, if known — People
// prepares their arrival with it (events between tools). Optional: the
// hire stands without it.
export function HireDialog({ name, onConfirm, onCancel, t }: { name: string | null; onConfirm: (startDate: string | null) => void; onCancel: () => void; t: { hire: Catalogue["hire"]; common: Catalogue["common"] } }) {
  const [day, setDay] = useState("");
  return (
    <Dialog open={name !== null} title={format(t.hire.title, { name: name ?? "" })} closeLabel={t.common.close} onClose={onCancel}>
      <form className="stack" onSubmit={e => { e.preventDefault(); onConfirm(day || null); setDay(""); }}>
        <div className="field-block">
          <label className="label" htmlFor="start-date">{t.hire.start} <span className="optional">{t.hire.optional}</span></label>
          <input id="start-date" type="date" className="field short" value={day} onChange={e => setDay(e.target.value)} aria-describedby="start-hint" />
          <p className="hint" id="start-hint">{t.hire.hint}</p>
        </div>
        <div className="form-actions">
          <button type="submit" className="button">{t.hire.confirm}</button>
          <button type="button" className="button quiet" onClick={() => { setDay(""); onCancel(); }}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}
