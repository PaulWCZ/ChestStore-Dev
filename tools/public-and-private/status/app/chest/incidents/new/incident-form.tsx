"use client";

import { DateField, TimeSelect, useToast } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImpactPicker, type PickerGroup } from "../../../../components/component-picker.tsx";
import { SecondField, SecondToggle } from "../../../../components/second-field.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Impact } from "../../../../lib/model.ts";
import { addDays } from "../../../../lib/zone.ts";
import { backfillIncident, postIncident, saveTemplate } from "../../actions.ts";

// A template as the form reads it (lib/templates.ts).
export type FormTemplate = { id: string; name: string; title: string; body: string; titleSecond: string | null; bodySecond: string | null; states: Record<string, Impact> };

type Words = {
  compose: Record<string, string>;
  states: Record<string, string>;
  steps: Record<string, string>;
  stepHelp: Record<string, string>;
  errors: Record<ErrorCode, string>;
  date: DateWords;
};

const draftKey = "status:incident-draft";

// One screen: what is wrong, what it touches and how badly, where the team
// stands, what customers read. Or, ticked, an incident of the past with
// its start and end. A template fills it in one choice; what is typed can
// become a template. The title and text are kept as a draft until posted.
export function IncidentForm({ groups, start = null, templates = [], languages, today, nowMinutes, zoneNote, t }: { groups: PickerGroup[]; start?: { states: Record<string, Impact>; title: string; body: string } | null; templates?: FormTemplate[]; languages: { second: string; secondName: string }; today: string; nowMinutes: number; zoneNote: string; t: Words }) {
  const w = t.compose;
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  const [title, setTitle] = useState(start?.title ?? "");
  const [body, setBody] = useState(start?.body ?? "");
  const [states, setStates] = useState<Record<string, Impact>>(start?.states ?? {});
  const [status, setStatus] = useState("investigating");
  const [past, setPast] = useState(false);
  const [startDay, setStartDay] = useState<string | null>(today);
  const [startMin, setStartMin] = useState(Math.max(0, nowMinutes - 120));
  const [endDay, setEndDay] = useState<string | null>(today);
  const [endMin, setEndMin] = useState(nowMinutes);
  const [resolution, setResolution] = useState(w.resolutionDefault ?? "");
  const [withSecond, setWithSecond] = useState(false);
  const [titleSecond, setTitleSecond] = useState("");
  const [bodySecond, setBodySecond] = useState("");
  const [resolutionSecond, setResolutionSecond] = useState("");
  const [template, setTemplate] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  // An incident of the past: today and yesterday one tap away.
  const recent = [{ label: t.date.today, value: today }, { label: t.date.yesterday, value: addDays(today, -1) }];
  const known = new Set(groups.flatMap(g => g.items.map(i => i.id)));

  const applyTemplate = (templateId: string) => {
    setTemplate(templateId);
    const found = templates.find(x => x.id === templateId);
    if (!found) return;
    setTitle(found.title);
    setBody(found.body);
    setStates(Object.fromEntries(Object.entries(found.states).filter(([c]) => known.has(c))));
    setWithSecond(Boolean(found.titleSecond || found.bodySecond));
    setTitleSecond(found.titleSecond ?? "");
    setBodySecond(found.bodySecond ?? "");
  };

  useEffect(() => {
    if (start) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { title?: string; body?: string } | null;
      if (saved?.title) setTitle(saved.title);
      if (saved?.body) setBody(saved.body);
    } catch {
      // No storage: no draft.
    }
  }, [start]);
  useEffect(() => {
    try {
      if (title || body) localStorage.setItem(draftKey, JSON.stringify({ title, body }));
    } catch {
      // No storage: no draft.
    }
  }, [title, body]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const empty = !title.trim() ? "title" : !body.trim() ? "body" : past && !resolution.trim() ? "resolution" : null;
    setMissing(empty);
    if (empty) {
      document.getElementById(empty)?.focus();
      return;
    }
    const second = withSecond ? { title: titleSecond, body: bodySecond, ...(past ? { resolution: resolutionSecond } : {}) } : null;
    const done = (value: { id: string }) => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear.
      }
      toast(past ? w.added! : w.posted!);
      router.push(`/chest/incidents/${value.id}`);
    };
    if (past) await run(() => backfillIncident({ title, body, resolution, states, started: { day: startDay ?? "", minutes: startMin }, resolved: { day: endDay ?? "", minutes: endMin }, second }), done);
    else await run(() => postIncident({ title, status, body, states, second }), done);
  };
  const keep = async () => {
    if (!title.trim() || !body.trim()) {
      toast(w.templateNeeds!);
      return;
    }
    await run(() => saveTemplate({ title, body, states, ...(withSecond ? { titleSecond, bodySecond } : {}) }), value => toast(format(w.templateSaved!, { name: value.name })));
  };
  const error = (id: string) => (missing === id ? { "aria-invalid": true, "aria-describedby": `${id}-missing` } : {});
  const missingLine = (id: string) => (missing === id ? <p id={`${id}-missing`} className="error" role="alert">{t.errors.required}</p> : null);

  return (
    <form className="stack-l form" noValidate onSubmit={submit}>
      {templates.length > 0 && !start && (
        <div className="template-pick">
          <label className="label" htmlFor="template">{w.template}</label>
          <select id="template" className="field" value={template} onChange={e => applyTemplate(e.target.value)}>
            <option value="">{w.templateNone}</option>
            {templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="title">{w.title}</label>
        <input id="title" className="field big" maxLength={160} placeholder={w.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} autoFocus {...error("title")} />
        {missingLine("title")}
      </div>

      <ImpactPicker groups={groups} value={states} onChange={setStates} t={{ impact: w.impact!, states: t.states, legend: w.components! }} />

      <label className="check toggle">
        <input type="checkbox" checked={past} onChange={e => setPast(e.target.checked)} />
        <span>{w.past}</span>
      </label>

      {past ? (
        <fieldset className="when-fields">
          <div className="when-row">
            <DateField id="start-day" label={w.startedDay!} value={startDay} onChange={setStartDay} today={today} max={today} chips={recent} required labels={t.date} />
            <div className="time-field">
              <label className="label" htmlFor="start-time">{w.startedTime}</label>
              <TimeSelect id="start-time" step={5} value={startMin} onChange={setStartMin} />
            </div>
          </div>
          <div className="when-row">
            <DateField id="end-day" label={w.resolvedDay!} value={endDay} onChange={setEndDay} today={today} min={startDay} max={today} chips={recent} required labels={t.date} />
            <div className="time-field">
              <label className="label" htmlFor="end-time">{w.resolvedTime}</label>
              <TimeSelect id="end-time" step={5} value={endMin} onChange={setEndMin} />
            </div>
          </div>
          <p className="hint">{zoneNote}</p>
        </fieldset>
      ) : (
        <fieldset className="steps-pick">
          <legend className="label">{w.status}</legend>
          {["investigating", "identified", "monitoring"].map(s => (
            <label key={s} className={`step-option${status === s ? " on" : ""}`}>
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
              <span><strong>{t.steps[s]}</strong><span className="muted">{t.stepHelp[s]}</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <div>
        <label className="label" htmlFor="body">{w.body}</label>
        <textarea id="body" className="field" rows={5} maxLength={5000} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-describedby={missing === "body" ? "body-missing body-hint" : "body-hint"} aria-invalid={missing === "body" || undefined} />
        {missingLine("body")}
        <p id="body-hint" className="hint">{w.bodyHint}</p>
      </div>

      {past && (
        <div>
          <label className="label" htmlFor="resolution">{w.resolution}</label>
          <textarea id="resolution" className="field" rows={2} maxLength={5000} value={resolution} onChange={e => setResolution(e.target.value)} {...error("resolution")} />
          {missingLine("resolution")}
        </div>
      )}

      <SecondToggle checked={withSecond} onChange={setWithSecond} label={format(w.alsoIn!, { language: languages.secondName })} />
      {withSecond && (
        <div className="stack">
          <SecondField id="title-second" label={format(w.titleIn!, { language: languages.secondName })} value={titleSecond} onChange={setTitleSecond} lang={languages.second} multiline={false} max={160} />
          <SecondField id="body-second" label={format(w.bodyIn!, { language: languages.secondName })} value={bodySecond} onChange={setBodySecond} lang={languages.second} rows={5} />
          {past && <SecondField id="resolution-second" label={format(w.resolutionIn!, { language: languages.secondName })} value={resolutionSecond} onChange={setResolutionSecond} lang={languages.second} rows={2} />}
        </div>
      )}

      <div className="submit-row">
        <button type="submit" className="button" disabled={pending}>{pending ? w.posting : past ? w.submitPast : w.submit}</button>
        <a className="button link" href="/chest">{w.cancel}</a>
        {!past && <button type="button" className="button link" disabled={pending} onClick={keep}>{w.saveTemplate}</button>}
        <p className="hint">{past ? w.pastTells : w.tells}</p>
      </div>
    </form>
  );
}
