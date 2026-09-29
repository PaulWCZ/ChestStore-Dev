"use client";

import { DateField, Dialog } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { format } from "../lib/i18n/format.ts";
import type { Catalogue } from "../lib/i18n/index.ts";

// Moving someone to "hired": the day they start, if known — People
// prepares their arrival with it (events between tools). Optional: the
// hire stands without it. The day is typed or picked in the member's
// language (the kit's DateField, never the browser's date field); `today`
// is the Chest's, from the server.
export function HireDialog({ name, today, onConfirm, onCancel, t }: { name: string | null; today: string; onConfirm: (startDate: string | null) => void; onCancel: () => void; t: { hire: Catalogue["hire"]; common: Catalogue["common"]; dialog: DialogWords; date: DateWords } }) {
  const [day, setDay] = useState<string | null>(null);
  const cancel = () => { setDay(null); onCancel(); };
  return (
    <Dialog open={name !== null} title={format(t.hire.title, { name: name ?? "" })} onClose={cancel} labels={t.dialog} size="s">
      <form className="stack" onSubmit={e => { e.preventDefault(); onConfirm(day); setDay(null); }}>
        <DateField id="start-date" label={t.hire.startOptional} value={day} onChange={setDay} today={today} min={today} hint={t.hire.hint} labels={t.date} />
        <div className="form-actions">
          <button type="submit" className="button">{t.hire.confirm}</button>
          <button type="button" className="button quiet" onClick={cancel}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}
