"use client";

import { Avatar, DateField, TimeSelect, useToast } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Check, Flag, Pencil, Plus, Trash } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addDays, dueState, nextWorkday } from "../../../lib/model.ts";
import type { Step } from "../../../lib/steps.ts";
import { addStep, clearStep, completeStep, reopenStep, updateStep } from "../actions.ts";
import { OwnerPicker } from "./owner-select.tsx";
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
  // Whether a timed step goes into the Chest's calendar (it works there).
  calendar?: boolean;
  t: Catalogue;
};

// The next steps of a deal or a contact: what, when (and at what time),
// who — soonest first; several may be open ("call Tuesday 14:30", "send
// samples Thursday"). "Done" logs one; when it was the last, the box asks
// what comes next, at once.
export function StepBox({ steps, on, team, people, me, canEdit, canAssign, today, calendar = false, t }: Props) {
  const [mode, setMode] = useState<{ kind: "view" } | { kind: "edit"; step: Step | null } | { kind: "next" }>({ kind: "view" });
  const [pending, start] = useTransition();
  const toast = useToast();
  const first = steps[0];
  const state = first ? dueState(first.due, today) : null;

  function done(step: Step) {
    start(async () => {
      const r = await completeStep(step.id);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      // One toast per step; its Undo says whether it worked.
      toast({
        id: `step-${step.id}`,
        text: t.step.doneToast,
        undo: async () => {
          const back = await reopenStep(step.id);
          setMode({ kind: "view" });
          return back.ok ? true : format(t.errors[back.error], back.values);
        },
      });
      if (canEdit && r.value.last) setMode({ kind: "next" });
    });
  }

  if (mode.kind !== "view" && canEdit) {
    return (
      <section className="step-box editing" aria-labelledby="step-title">
        <h2 id="step-title" className="label-mono"><Flag />{mode.kind === "next" ? t.step.whatNext : t.step.title}</h2>
        <StepForm initial={mode.kind === "edit" ? mode.step : null} on={on} team={team} me={me} canAssign={canAssign} today={today} calendar={calendar} onDone={() => setMode({ kind: "view" })} onSkip={mode.kind === "next" ? () => setMode({ kind: "view" }) : null} t={t} />
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
                      <Avatar name={people[step.owner ?? ""]?.name ?? t.common.unassigned} photo={people[step.owner ?? ""]?.photo ?? null} size="s" />
                      {step.owner === me ? t.people.you : people[step.owner ?? ""]?.name ?? t.common.unassigned}
                    </span>
                  </p>
                  <div className="row">
                    {canComplete && <button type="button" className="button small" disabled={pending} onClick={() => done(step)}><Check />{t.step.done}</button>}
                    {canEdit && <button type="button" className="button small quiet" onClick={() => setMode({ kind: "edit", step })}><Pencil />{t.step.change}</button>}
                    {canEdit && (
                      <button type="button" className="icon-button small" disabled={pending} title={t.step.remove} onClick={() => start(async () => {
                        const r = await clearStep(step.id);
                        toast(r.ok ? t.step.cleared : { text: format(t.errors[r.error], r.values), tone: "error" });
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
// day typed or picked on a calendar — the kit's DateField; a time if it
// matters), who. `on` null: a step of one's own.
export function StepForm({ initial, on, team, me, canAssign, today, calendar = false, onDone, onSkip, t }: { initial: Step | null; on: On | null; team: Teammate[]; me: string; canAssign: boolean; today: string; calendar?: boolean; onDone: () => void; onSkip: (() => void) | null; t: Catalogue }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [due, setDue] = useState<string | null>(initial?.due ?? nextWorkday(today));
  const [time, setTime] = useState<number | null>(minutesOf(initial?.time ?? null));
  const [owner, setOwner] = useState<string | null>(initial?.owner ?? me);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const chips = [
    { label: t.step.today, value: today },
    { label: t.step.tomorrow, value: nextWorkday(today) },
    { label: t.step.inWeek, value: addDays(today, 7) },
  ];
  const key = on === null ? "self" : "deal" in on ? "d" + on.deal : "c" + on.contact;
  return (
    <form className="form step-form" onSubmit={e => {
      e.preventDefault();
      setError(null);
      if (!due) return setError(t.step.dueMissing);
      start(async () => {
        const input = { text, due, time: time === null ? null : clock(time), owner };
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
      <div className="step-when">
        <DateField id={`step-due-${key}`} label={t.step.due} value={due} onChange={setDue} today={today} chips={chips} required labels={t.date} />
        <div className="field-block step-time">
          <label className="label" htmlFor={`step-time-${key}`}>{t.step.time}</label>
          <TimeSelect id={`step-time-${key}`} className="field" value={time} onChange={setTime} empty={t.step.noTime} step={30} min={7 * 60} max={21 * 60} />
        </div>
      </div>
      {/* Where the Chest has a calendar, a step with a time goes into it. */}
      {calendar && time !== null && <p className="hint" role="status">{owner === me ? t.step.inCalendar : t.step.inTheirCalendar}</p>}
      <OwnerPicker id={`step-who-${key}`} label={t.step.who} value={owner} team={team} me={me} canAssign={canAssign} allowNobody={false} onChange={setOwner} t={t} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button small" disabled={pending}>{t.step.save}</button>
        <button type="button" className="button small quiet" onClick={onSkip ?? onDone}>{onSkip ? t.step.skip : t.common.cancel}</button>
      </div>
    </form>
  );
}

// A step's time is kept as "14:30"; the kit's TimeSelect counts minutes.
function minutesOf(time: string | null): number | null {
  const m = time ? /^(\d{2}):(\d{2})/u.exec(time) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
