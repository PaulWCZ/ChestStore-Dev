import { Dialog } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { format } from "../shared/format.ts";
import { useDateProblems, WatchedDateField } from "./date-problems.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Moving someone to "hired": the day they start, if known — People
// prepares their arrival with it (events between tools). Optional: the
// hire stands without it. The day is typed or picked in the member's
// language (the kit's DateField, never the browser's date field); `today`
// is the Chest's, from the server. A day the field refused (before today,
// unreadable) leaves the previous one in `day`: the hire waits, on the
// field and its sentence, rather than record that day or none.
export function HireDialog({ name, today, onConfirm, onCancel, t }: { name: string | null; today: string; onConfirm: (startDate: string | null) => void; onCancel: () => void; t: { hire: Catalogue["hire"]; common: Catalogue["common"]; dialog: DialogWords; date: DateWords } }) {
  const [day, setDay] = useState<string | null>(null);
  const dates = useDateProblems();
  const cancel = () => { setDay(null); onCancel(); };
  return (
    <Dialog open={name !== null} title={format(t.hire.title, { name: name ?? "" })} onClose={cancel} labels={t.dialog} size="s">
      <form className="stack" onSubmit={e => {
        e.preventDefault();
        if (dates.problem) { document.getElementById("start-date")?.focus(); return; }
        onConfirm(day);
        setDay(null);
      }}>
        <WatchedDateField id="start-date" label={t.hire.startOptional} value={day} onChange={setDay} onProblem={dates.watch("start-date")} today={today} min={today} hint={t.hire.hint} labels={t.date} />
        <div className="form-actions">
          <button type="submit" className="button">{t.hire.confirm}</button>
          <button type="button" className="button quiet" onClick={cancel}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}
