"use client";

import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Check, Flag, Pencil, Plus, Trash } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addDays, dueState, nextWorkday, stepTimes } from "../../../lib/model.ts";
import type { Step } from "../../../lib/steps.ts";
import { addStep, clearStep, completeStep, reopenStep, updateStep } from "../actions.ts";
import { OwnerSelect } from "./owner-select.tsx";
import type { People, Teammate } from "./shared.ts";

// A step as its view shows it: when, in words the server wrote.
export type ShownStep = Step & { label: string };
type On = { deal: string } | { contact: string };
type Props = {
  steps: ShownStep[];
  on: On;
  team: Teammate[];
  people: People;
  me: string;
  canEdit: boolean;
  canAssign: boolean;
  today: string;
  t: Catalogue;
};

// The next steps of a deal or a contact: what, when (and at what time),
// who — soonest first; several may be open ("call Tuesday 14:30", "send
// samples Thursday"). "Done" logs one; when it was the last, the box asks
// what comes next, at once.
export function StepBox({ steps, on, team, people, me, canEdit, canAssign, today, t }: Props) {
  const [mode, setMode] = useState<{ kind: "view" } | { kind: "edit"; step: Step | null } | { kind: "next" }>({ kind: "view" });
  const [pending, start] = useTransition();
  const toast = useToast();
  const first = steps[0];
  const state = first ? dueState(first.due, today) : null;

  function done(step: Step) {
    start(async () => {
      const r = await completeStep(step.id);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(t.step.doneToast, { label: t.common.undo, run: () => start(async () => { await reopenStep(step.id); setMode({ kind: "view" }); }) });
      if (canEdit && r.value.last) setMode({ kind: "next" });
    });
  }

  if (mode.kind !== "view" && canEdit) {
    return (
      <section className="step-box editing" aria-labelledby="step-title">
        <h2 id="step-title" className="label-mono"><Flag />{mode.kind === "next" ? t.step.whatNext : t.step.title}</h2>
        <StepForm initial={mode.kind === "edit" ? mode.step : null} on={on} team={team} me={me} canAssign={canAssign} today={today} onDone={() => setMode({ kind: "view" })} onSkip={mode.kind === "next" ? () => setMode({ kind: "view" }) : null} t={t} />
      </section>
    );
  }
  return (
    <section className={`step-box${state ? " " + state : ""}`} aria-labelledby="step-title">
      <h2 id="step-title" className="label-mono"><Flag />{t.step.title}{steps.length > 1 && <span className="count num">{steps.length}</span>}</h2>
      {steps.length === 0 ? (
        <>
          <p className="muted">{t.step.none}</p>
          {canEdit && <button type="button" className="button small" onClick={() => setMode({ kind: "edit", step: null })}><Flag />{t.step.add}</button>}
        </>
      ) : (
        <>
          <ul className="step-items">
            {steps.map(step => {
              const s = dueState(step.due, today);
              const canComplete = canEdit || step.owner === me;
              return (
                <li key={step.id} className={`step-item ${s}`}>
                  <p className="step-text">{step.text}</p>
                  <p className="step-meta">
                    <span className={`due ${s}`}>{step.label}</span>
                    <span className="who">
                      <Avatar name={people[step.owner ?? ""]?.name ?? t.common.unassigned} photo={people[step.owner ?? ""]?.photo ?? null} size={20} />
                      {step.owner === me ? t.people.you : people[step.owner ?? ""]?.name ?? t.common.unassigned}
                    </span>
                  </p>
                  <div className="row">
                    {canComplete && <button type="button" className="button small" disabled={pending} onClick={() => done(step)}><Check />{t.step.done}</button>}
                    {canEdit && <button type="button" className="button small quiet" onClick={() => setMode({ kind: "edit", step })}><Pencil />{t.step.change}</button>}
                    {canEdit && (
                      <button type="button" className="icon-button small" disabled={pending} title={t.step.remove} onClick={() => start(async () => {
                        const r = await clearStep(step.id);
                        toast(r.ok ? t.step.cleared : format(t.errors[r.error], r.values));
                      })}><Trash /><span className="visually-hidden">{t.step.remove}</span></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {canEdit && <button type="button" className="link-button" onClick={() => setMode({ kind: "edit", step: null })}><Plus />{t.step.another}</button>}
        </>
      )}
    </section>
  );
}

// Plan a step, or change one: what, when (today, tomorrow, in a week, or a
// day; a time if it matters), who. `on` null: a step of one's own.
export function StepForm({ initial, on, team, me, canAssign, today, onDone, onSkip, t }: { initial: Step | null; on: On | null; team: Teammate[]; me: string; canAssign: boolean; today: string; onDone: () => void; onSkip: (() => void) | null; t: Catalogue }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [due, setDue] = useState(initial?.due ?? nextWorkday(today));
  const [time, setTime] = useState(initial?.time ?? "");
  const [owner, setOwner] = useState<string | null>(initial?.owner ?? me);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const quick = [
    { label: t.step.today, day: today },
    { label: t.step.tomorrow, day: nextWorkday(today) },
    { label: t.step.inWeek, day: addDays(today, 7) },
  ];
  const key = on === null ? "self" : "deal" in on ? "d" + on.deal : "c" + on.contact;
  return (
    <form className="form step-form" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const input = { text, due, time: time || null, owner };
        const r = initial ? await updateStep(initial.id, input) : await addStep(on, input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(t.step.planned);
        onDone();
      });
    }}>
      <div className="field-block">
        <label className="label" htmlFor={`step-text-${key}`}>{t.step.text}</label>
        <input id={`step-text-${key}`} className="field" value={text} onChange={e => setText(e.target.value)} maxLength={200} required autoFocus placeholder={t.step.textPlaceholder} />
      </div>
      <div className="field-block">
        <span className="label" id={`step-due-label-${key}`}>{t.step.due}</span>
        <div className="quick-days" role="group" aria-labelledby={`step-due-label-${key}`}>
          {quick.map(q => <button key={q.label} type="button" className={`chip-button${due === q.day ? " on" : ""}`} aria-pressed={due === q.day} onClick={() => setDue(q.day)}>{q.label}</button>)}
          <label className="visually-hidden" htmlFor={`step-due-${key}`}>{t.step.due}</label>
          <input id={`step-due-${key}`} className="field date" type="date" value={due} onChange={e => setDue(e.target.value)} required />
          <label className="visually-hidden" htmlFor={`step-time-${key}`}>{t.step.time}</label>
          <select id={`step-time-${key}`} className="field time" value={time} onChange={e => setTime(e.target.value)}>
            <option value="">{t.step.noTime}</option>
            {!stepTimes.includes(time) && time !== "" && <option value={time}>{time}</option>}
            {stepTimes.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <div className="field-block">
        <label className="label" htmlFor={`step-who-${key}`}>{t.step.who}</label>
        <OwnerSelect id={`step-who-${key}`} value={owner} team={team} me={me} canAssign={canAssign} allowNobody={false} onChange={setOwner} t={t} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button small" disabled={pending}>{t.step.save}</button>
        <button type="button" className="button small quiet" onClick={onSkip ?? onDone}>{onSkip ? t.step.skip : t.common.cancel}</button>
      </div>
    </form>
  );
}
