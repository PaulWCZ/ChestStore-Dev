"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Kind } from "../../../../lib/model.ts";
import { startChecklist } from "../../actions.ts";

type Words = {
  start: { person: string; choosePerson: string; template: string; chooseTemplate: string; firstDay: string; lastDay: string; submit: string; starting: string; told: string };
  kinds: Record<Kind, string>;
  errors: Record<ErrorCode, string>;
};

export function StartForm({ people, templates, initial, today, t }: {
  people: { id: string; name: string; startDate: string | null }[];
  templates: { id: string; name: string; kind: Kind; steps: number }[];
  initial: { person: string; kind: Kind; template: string };
  today: string;
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
  const startDate = people.find(p => p.id === person)?.startDate ?? null;
  const [anchor, setAnchor] = useState(chosen.kind === "onboarding" && startDate ? startDate : today);
  const [touched, setTouched] = useState(false);
  const suggest = (p: string, tid: string) => {
    if (touched) return;
    const k = templates.find(x => x.id === tid)?.kind;
    const s = people.find(x => x.id === p)?.startDate ?? null;
    setAnchor(k === "onboarding" && s ? s : today);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await startChecklist({ personId: person, templateId, anchor });
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
        <select id={uid + "person"} className="select" value={person} required onChange={e => { setPerson(e.target.value); suggest(e.target.value, templateId); }}>
          <option value="" disabled>{t.start.choosePerson}</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
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
        <input id={uid + "anchor"} className="field short" type="date" value={anchor} required min="2000-01-01" max="2100-12-31" onChange={e => { setAnchor(e.target.value); setTouched(true); }} />
      </div>
      <p className="hint">{t.start.told}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending || !person}>{pending ? t.start.starting : t.start.submit}</button>
      </div>
    </form>
  );
}
