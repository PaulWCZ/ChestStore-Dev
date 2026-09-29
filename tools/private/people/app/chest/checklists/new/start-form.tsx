"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { isWeekend, type Kind } from "../../../../lib/model.ts";
import { startChecklist } from "../../actions.ts";

type Words = {
  start: { person: string; choosePerson: string; template: string; chooseTemplate: string; firstDay: string; lastDay: string; submit: string; starting: string; told: string; manager: string; noManager: string; weekend: string };
  group: string;
  kinds: Record<Kind, string>;
  errors: Record<ErrorCode, string>;
};

// An arrival told by Hiring is "arrival:<id>" in the person picker: not a
// member yet, so HR names their manager-to-be here.
export function StartForm({ people, arrivals, templates, initial, today, weekdays, t }: {
  people: { id: string; name: string; startDate: string | null }[];
  arrivals: { id: string; name: string; startDate: string | null; managerId: string | null }[];
  templates: { id: string; name: string; kind: Kind; steps: number }[];
  initial: { person: string; kind: Kind; template: string };
  today: string;
  // The names of the days, Sunday first, in the reader's language.
  weekdays: string[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState(initial.person);
  const firstOfKind = templates.find(x => x.kind === initial.kind) ?? templates[0]!;
  const [templateId, setTemplateId] = useState(templates.some(x => x.id === initial.template) ? initial.template : firstOfKind.id);
  const chosen = templates.find(x => x.id === templateId)!;
  const everyone = [...people, ...arrivals];
  const arrival = arrivals.find(a => a.id === person);
  const [managerId, setManagerId] = useState(arrival?.managerId ?? "");
  const startDate = everyone.find(p => p.id === person)?.startDate ?? null;
  const [anchor, setAnchor] = useState(chosen.kind === "onboarding" && startDate ? startDate : today);
  const [touched, setTouched] = useState(false);
  const weekend = /^\d{4}-\d{2}-\d{2}$/u.test(anchor) && isWeekend(anchor) ? weekdays[new Date(anchor + "T00:00:00Z").getUTCDay()]! : null;
  const suggest = (p: string, tid: string) => {
    if (touched) return;
    const k = templates.find(x => x.id === tid)?.kind;
    const s = everyone.find(x => x.id === p)?.startDate ?? null;
    setAnchor(k === "onboarding" && s ? s : today);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await startChecklist(arrival ? { arrivalId: arrival.id.slice("arrival:".length), managerId: managerId || null, templateId, anchor } : { personId: person, templateId, anchor });
      if (!result.ok) {
        setError(format(t.errors[result.error], result.values ?? {}));
        return;
      }
      toast(t.start.told);
      router.push(`/chest/checklists/${result.value.id}`);
    });
  };
  return (
    <form className="form card-block" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor={uid + "person"} className="label">{t.start.person}</label>
        <select id={uid + "person"} className="select" value={person} required onChange={e => { setPerson(e.target.value); setManagerId(arrivals.find(a => a.id === e.target.value)?.managerId ?? ""); suggest(e.target.value, templateId); }}>
          <option value="" disabled>{t.start.choosePerson}</option>
          {arrivals.length > 0 && <optgroup label={t.group}>{arrivals.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {arrival && (
        <div className="field-group">
          <label htmlFor={uid + "manager"} className="label">{t.start.manager}</label>
          <select id={uid + "manager"} className="select" value={managerId} onChange={e => setManagerId(e.target.value)}>
            <option value="">{t.start.noManager}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <fieldset className="field-group">
        <legend className="label">{t.start.template}</legend>
        <div className="choices">
          {templates.map(x => (
            <label key={x.id} className="choice">
              <input type="radio" name="template" value={x.id} checked={x.id === templateId} onChange={() => { setTemplateId(x.id); suggest(person, x.id); }} />
              <span className={`kind ${x.kind}`}>{t.kinds[x.kind]}</span>
              <strong>{x.name}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field-group">
        <label htmlFor={uid + "anchor"} className="label">{chosen.kind === "onboarding" ? t.start.firstDay : t.start.lastDay}</label>
        <input id={uid + "anchor"} className="field short" type="date" value={anchor} required min="2000-01-01" max="2100-12-31" onChange={e => { setAnchor(e.target.value); setTouched(true); }} aria-describedby={weekend ? uid + "weekend" : undefined} />
        {weekend && <p id={uid + "weekend"} className="hint warn-hint" role="status">{format(t.start.weekend, { day: weekend })}</p>}
      </div>
      <p className="hint">{t.start.told}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending || !person}>{pending ? t.start.starting : t.start.submit}</button>
      </div>
    </form>
  );
}
