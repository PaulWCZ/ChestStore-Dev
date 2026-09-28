"use client";

import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Check, Flag, Pencil } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, formatDay } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { addDays, dueState, nextWorkday } from "../../../lib/model.ts";
import type { Step } from "../../../lib/steps.ts";
import { clearStep, completeStep, reopenStep, setStep } from "../actions.ts";
import { OwnerSelect } from "./owner-select.tsx";
import type { People, Teammate } from "./shared.ts";

type Props = {
  step: Step | null;
  // The day as the server writes it (a browser's calendar data may name
  // months differently: the page would not match what the server sent).
  dueLabel: string | null;
  on: { deal: string } | { contact: string };
  team: Teammate[];
  people: People;
  me: string;
  canEdit: boolean;
  canAssign: boolean;
  today: string;
  locale: Locale;
  t: Catalogue;
};

// The next step of a deal or a contact: what, when, who. "Done" logs it
// and asks what comes next, at once.
export function StepBox({ step, dueLabel, on, team, people, me, canEdit, canAssign, today, locale, t }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "next">("view");
  const [pending, start] = useTransition();
  const toast = useToast();
  const canComplete = step !== null && (canEdit || step.owner === me);
  const state = step ? dueState(step.due, today) : null;

  function done() {
    if (!step) return;
    start(async () => {
      const r = await completeStep(step.id);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(t.step.doneToast, { label: t.common.undo, run: () => start(async () => { await reopenStep(step.id); setMode("view"); }) });
      if (canEdit) setMode("next");
    });
  }

  if (mode !== "view" && canEdit) {
    return (
      <section className="step-box editing" aria-labelledby="step-title">
        <h2 id="step-title" className="label-mono"><Flag />{mode === "next" ? t.step.whatNext : t.step.title}</h2>
        <StepForm initial={mode === "edit" ? step : null} on={on} team={team} me={me} canAssign={canAssign} today={today} onDone={() => setMode("view")} onSkip={mode === "next" ? () => setMode("view") : null} t={t} />
      </section>
    );
  }
  return (
    <section className={`step-box${state ? " " + state : ""}`} aria-labelledby="step-title">
      <h2 id="step-title" className="label-mono"><Flag />{t.step.title}</h2>
      {step ? (
        <>
          <p className="step-text">{step.text}</p>
          <p className="step-meta">
            <span className={`due ${state}`}>{state === "late" ? t.step.late + " · " : ""}{step.due === today ? t.step.today : dueLabel ?? formatDay(step.due, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
            <span className="who">
              <Avatar name={people[step.owner ?? ""]?.name ?? t.common.unassigned} photo={people[step.owner ?? ""]?.photo ?? null} size={20} />
              {step.owner === me ? t.people.you : people[step.owner ?? ""]?.name ?? t.common.unassigned}
            </span>
          </p>
          <div className="row">
            {canComplete && <button type="button" className="button small" disabled={pending} onClick={done}><Check />{t.step.done}</button>}
            {canEdit && <button type="button" className="button small quiet" onClick={() => setMode("edit")}><Pencil />{t.step.change}</button>}
            {canEdit && (
              <button type="button" className="link-button" disabled={pending} onClick={() => start(async () => {
                const r = await clearStep(step.id);
                toast(r.ok ? t.step.cleared : format(t.errors[r.error], r.values));
              })}>{t.step.clear}</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t.step.none}</p>
          {canEdit && <button type="button" className="button small" onClick={() => setMode("edit")}><Flag />{t.step.add}</button>}
        </>
      )}
    </section>
  );
}

export function StepForm({ initial, on, team, me, canAssign, today, onDone, onSkip, t }: { initial: Step | null; on: { deal: string } | { contact: string }; team: Teammate[]; me: string; canAssign: boolean; today: string; onDone: () => void; onSkip: (() => void) | null; t: Catalogue }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [due, setDue] = useState(initial?.due ?? nextWorkday(today));
  const [owner, setOwner] = useState<string | null>(initial?.owner ?? me);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const quick = [
    { label: t.step.today, day: today },
    { label: t.step.tomorrow, day: nextWorkday(today) },
    { label: t.step.inWeek, day: addDays(today, 7) },
  ];
  const key = "deal" in on ? "d" + on.deal : "c" + on.contact;
  return (
    <form className="form step-form" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await setStep(on, { text, due, owner });
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
