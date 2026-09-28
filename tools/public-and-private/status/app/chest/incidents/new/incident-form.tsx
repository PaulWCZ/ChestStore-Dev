"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ImpactPicker, type PickerGroup } from "../../../../components/component-picker.tsx";
import { TimeSelect } from "../../../../components/time-select.tsx";
import { useRun } from "../../../../components/use-run.ts";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Impact } from "../../../../lib/model.ts";
import { backfillIncident, postIncident } from "../../actions.ts";

type Words = {
  compose: Record<string, string>;
  states: Record<string, string>;
  steps: Record<string, string>;
  stepHelp: Record<string, string>;
  errors: Record<ErrorCode, string>;
};

const draftKey = "status:incident-draft";

// One screen: what is wrong, what it touches and how badly, where the team
// stands, what customers read. Or, ticked, an incident of the past with
// its start and end. The title and text are kept as a draft until posted.
export function IncidentForm({ groups, today, nowMinutes, zoneNote, t }: { groups: PickerGroup[]; today: string; nowMinutes: number; zoneNote: string; t: Words }) {
  const w = t.compose;
  const router = useRouter();
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [states, setStates] = useState<Record<string, Impact>>({});
  const [status, setStatus] = useState("investigating");
  const [past, setPast] = useState(false);
  const [startDay, setStartDay] = useState(today);
  const [startMin, setStartMin] = useState(Math.max(0, nowMinutes - 120));
  const [endDay, setEndDay] = useState(today);
  const [endMin, setEndMin] = useState(nowMinutes);
  const [resolution, setResolution] = useState(w.resolutionDefault ?? "");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { title?: string; body?: string } | null;
      if (saved?.title) setTitle(saved.title);
      if (saved?.body) setBody(saved.body);
    } catch {
      // No storage: no draft.
    }
  }, []);
  useEffect(() => {
    try {
      if (title || body) localStorage.setItem(draftKey, JSON.stringify({ title, body }));
    } catch {
      // No storage: no draft.
    }
  }, [title, body]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const done = (value: { id: string }) => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear.
      }
      toast(past ? w.added! : w.posted!);
      router.push(`/chest/incidents/${value.id}`);
    };
    if (past) await run(() => backfillIncident({ title, body, resolution, states, started: { day: startDay, minutes: startMin }, resolved: { day: endDay, minutes: endMin } }), done);
    else await run(() => postIncident({ title, status, body, states }), done);
  };

  return (
    <form className="stack-l form" onSubmit={submit}>
      <div>
        <label className="label" htmlFor="title">{w.title}</label>
        <input id="title" className="field big" required maxLength={160} placeholder={w.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </div>

      <ImpactPicker groups={groups} value={states} onChange={setStates} t={{ impact: w.impact!, states: t.states, legend: w.components! }} />

      <label className="check toggle">
        <input type="checkbox" checked={past} onChange={e => setPast(e.target.checked)} />
        <span>{w.past}</span>
      </label>

      {past ? (
        <fieldset className="when-fields">
          <div className="when-row">
            <label className="label" htmlFor="start-day">{w.startedDay}</label>
            <input id="start-day" type="date" className="field" required value={startDay} max={today} onChange={e => setStartDay(e.target.value)} />
            <span className="label">{w.startedTime}</span>
            <TimeSelect id="start-time" value={startMin} onChange={setStartMin} hourLabel={`${w.startedDay} — ${w.hour}`} minuteLabel={`${w.startedDay} — ${w.minute}`} />
          </div>
          <div className="when-row">
            <label className="label" htmlFor="end-day">{w.resolvedDay}</label>
            <input id="end-day" type="date" className="field" required value={endDay} max={today} onChange={e => setEndDay(e.target.value)} />
            <span className="label">{w.resolvedTime}</span>
            <TimeSelect id="end-time" value={endMin} onChange={setEndMin} hourLabel={`${w.resolvedDay} — ${w.hour}`} minuteLabel={`${w.resolvedDay} — ${w.minute}`} />
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
        <textarea id="body" className="field" required rows={5} maxLength={5000} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-describedby="body-hint" />
        <p id="body-hint" className="hint">{w.bodyHint}</p>
      </div>

      {past && (
        <div>
          <label className="label" htmlFor="resolution">{w.resolution}</label>
          <textarea id="resolution" className="field" required rows={2} maxLength={5000} value={resolution} onChange={e => setResolution(e.target.value)} />
        </div>
      )}

      <div className="submit-row">
        <button type="submit" className="button" disabled={pending}>{pending ? w.posting : past ? w.submitPast : w.submit}</button>
        <a className="button link" href="/chest">{w.cancel}</a>
        <p className="hint">{past ? w.pastTells : w.tells}</p>
      </div>
    </form>
  );
}
