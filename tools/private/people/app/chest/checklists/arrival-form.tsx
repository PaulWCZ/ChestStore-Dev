"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { isWeekend, limits } from "../../../lib/model.ts";
import { addArrival, updateArrival } from "../actions.ts";

// "Someone is joining": HR writes an arrival by hand — a hire made outside
// the Hiring tool — to prepare it before day 1. The same arrival Hiring's
// event makes: its checklist, the link to the member once they have access.
export type ArrivalDraft = { id?: string; name: string; job: string; team: string; place: string; startDate: string | null; managerId: string | null; workEmail: string };
type Words = {
  arrivals: {
    add: string; addTitle: string; editTitle: string; edit: string; name: string; job: string; team: string; office: string; startDate: string; manager: string;
    noManager: string; workEmail: string; workEmailHint: string; save: string; saving: string; added: string; saved: string; cancel: string; weekend: string;
  };
  errors: Record<ErrorCode, string>;
};

export function ArrivalForm({ draft, people, known, weekdays, t }: {
  draft?: ArrivalDraft;
  people: { id: string; name: string }[];
  known: { teams: string[]; offices: string[]; titles: string[] };
  // The names of the days, Sunday first, in the reader's language.
  weekdays: string[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [startDate, setStartDate] = useState(draft?.startDate ?? "");
  const weekend = /^\d{4}-\d{2}-\d{2}$/u.test(startDate) && isWeekend(startDate) ? weekdays[new Date(startDate + "T00:00:00Z").getUTCDay()]! : null;

  if (!open) {
    return draft
      ? <button type="button" className="button quiet small" onClick={() => setOpen(true)}><Pencil />{t.arrivals.edit}</button>
      : <button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.arrivals.add}</button>;
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "");
    const input = { name: text("name"), job: text("job"), team: text("team"), place: text("place"), startDate: text("startDate") || null, managerId: text("managerId") || null, workEmail: text("workEmail") };
    setError(null);
    start(async () => {
      const r = draft?.id ? await updateArrival(draft.id, input) : await addArrival(input);
      if (!r.ok) {
        setError(format(t.errors[r.error], r.values ?? {}));
        return;
      }
      toast(draft?.id ? t.arrivals.saved : t.arrivals.added);
      setOpen(false);
      router.refresh();
    });
  };
  return (
    <form className="form card-block arrival-form" onSubmit={submit} noValidate>
      <h3>{draft?.id ? t.arrivals.editTitle : t.arrivals.addTitle}</h3>
      <div className="grid-2">
        <div className="field-group">
          <label htmlFor={uid + "name"} className="label">{t.arrivals.name}</label>
          <input id={uid + "name"} name="name" className="field" required defaultValue={draft?.name ?? ""} maxLength={limits.name} autoComplete="off" autoFocus />
        </div>
        <div className="field-group">
          <label htmlFor={uid + "start"} className="label">{t.arrivals.startDate}</label>
          <input id={uid + "start"} name="startDate" className="field" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min="2000-01-01" max="2100-12-31" aria-describedby={weekend ? uid + "weekend" : undefined} />
          {weekend && <p id={uid + "weekend"} className="hint warn-hint" role="status">{format(t.arrivals.weekend, { day: weekend })}</p>}
        </div>
        <div className="field-group">
          <label htmlFor={uid + "job"} className="label">{t.arrivals.job}</label>
          <input id={uid + "job"} name="job" className="field" defaultValue={draft?.job ?? ""} maxLength={limits.title} list={uid + "titles"} autoComplete="off" />
          <datalist id={uid + "titles"}>{known.titles.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "team"} className="label">{t.arrivals.team}</label>
          <input id={uid + "team"} name="team" className="field" defaultValue={draft?.team ?? ""} maxLength={limits.team} list={uid + "teams"} autoComplete="off" />
          <datalist id={uid + "teams"}>{known.teams.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "place"} className="label">{t.arrivals.office}</label>
          <input id={uid + "place"} name="place" className="field" defaultValue={draft?.place ?? ""} maxLength={limits.office} list={uid + "offices"} autoComplete="off" />
          <datalist id={uid + "offices"}>{known.offices.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "manager"} className="label">{t.arrivals.manager}</label>
          <select id={uid + "manager"} name="managerId" className="select" defaultValue={draft?.managerId ?? ""}>
            <option value="">{t.arrivals.noManager}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "email"} className="label">{t.arrivals.workEmail}</label>
          <input id={uid + "email"} name="workEmail" className="field" type="email" inputMode="email" defaultValue={draft?.workEmail ?? ""} maxLength={limits.email} autoComplete="off" aria-describedby={uid + "email-hint"} />
          <p id={uid + "email-hint"} className="hint">{t.arrivals.workEmailHint}</p>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending}>{pending ? t.arrivals.saving : t.arrivals.save}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.arrivals.cancel}</button>
      </div>
    </form>
  );
}
