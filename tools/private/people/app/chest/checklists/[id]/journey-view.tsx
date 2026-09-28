"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus, Trash } from "../../../../components/icons.tsx";
import { Portrait } from "../../../../components/portrait.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { limits, type DueState, type Kind } from "../../../../lib/model.ts";
import { addChecklistItem, deleteChecklist, removeChecklistItem, stopChecklist, tickItem, updateChecklistItem } from "../../actions.ts";

export type StepView = {
  id: string; text: string; done: boolean; due: string; dueLabel: string; state: DueState; when: "before" | "on" | "after";
  assignee: string | null; assigneeName: string; assigneePhoto: string | null; role: string; doneBy: string | null; mine: boolean; waiting: boolean;
};
type Words = {
  journey: {
    before: Record<Kind, string>; onDay: Record<Kind, string>; after: Record<Kind, string>;
    mark: string; give: string; due: string; remove: string; removed: string; add: string; addPlaceholder: string; addButton: string;
    stop: string; stoppedToast: string; stoppedBanner: string; restart: string; delete: string; deleted: string; completeBanner: string;
    late: string; today: string; saved: string; undo: string;
  };
  todo: { done: string; undone: string };
  nobody: string;
  errors: Record<ErrorCode, string>;
};

export function JourneyView({ journey, steps, hr, people, t }: {
  journey: { id: string; kind: Kind; anchor: string; stopped: boolean; complete: boolean };
  steps: StepView[];
  hr: boolean;
  people: { id: string; name: string }[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [ticked, setTicked] = useOptimistic(new Map<string, boolean>(), (state, change: { id: string; done: boolean }) => new Map(state).set(change.id, change.done));
  const say = (result: { ok: true } | { ok: false; error: ErrorCode; values?: Record<string, string | number> }, success?: string, undo?: () => void) => {
    if (!result.ok) toast(format(t.errors[result.error], result.values ?? {}));
    else if (success) toast(success, undo ? { label: t.journey.undo, run: undo } : undefined);
    return result.ok;
  };
  const tick = (id: string, done: boolean, undoable = true) => start(async () => {
    setTicked({ id, done });
    say(await tickItem(id, done), undoable ? (done ? t.todo.done : t.todo.undone) : undefined, undoable ? () => tick(id, !done, false) : undefined);
  });
  const remove = (id: string, removed: boolean) => start(async () => {
    setEditing(null);
    say(await removeChecklistItem(id, removed), removed ? t.journey.removed : undefined, removed ? () => remove(id, false) : undefined);
  });
  const update = (id: string, input: { assignee?: string | null; due?: string }) => start(async () => {
    say(await updateChecklistItem(id, input), t.journey.saved);
  });
  const stop = (stopped: boolean) => start(async () => {
    say(await stopChecklist(journey.id, stopped), stopped ? t.journey.stoppedToast : undefined, stopped ? () => stop(false) : undefined);
  });
  const destroy = () => start(async () => {
    if (say(await deleteChecklist(journey.id), t.journey.deleted)) router.push("/chest/checklists");
  });
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    start(async () => {
      if (say(await addChecklistItem(journey.id, { text: String(data.get("text") ?? ""), assignee: String(data.get("assignee") ?? "") || null, due: String(data.get("due") ?? "") }))) form.reset();
    });
  };
  const shown = steps.map(s => ({ ...s, done: ticked.get(s.id) ?? s.done }));
  const phases = (["before", "on", "after"] as const).map(when => ({ when, steps: shown.filter(s => s.when === when) })).filter(p => p.steps.length > 0);
  const title = { before: t.journey.before[journey.kind], on: t.journey.onDay[journey.kind], after: t.journey.after[journey.kind] };
  const locked = journey.stopped;
  return (
    <div className="journey">
      {journey.stopped && (
        <div className="banner warn">
          <span>{t.journey.stoppedBanner}</span>
          {hr && (
            <span className="row">
              <button type="button" className="button small" onClick={() => stop(false)}>{t.journey.restart}</button>
              <button type="button" className="button quiet small danger" onClick={destroy}><Trash />{t.journey.delete}</button>
            </span>
          )}
        </div>
      )}
      {!journey.stopped && shown.length > 0 && shown.every(s => s.done) && <p className="banner ok">{t.journey.completeBanner}</p>}
      {phases.map(phase => (
        <section key={phase.when} className="phase" aria-labelledby={uid + phase.when}>
          <h2 id={uid + phase.when} className="eyebrow">{title[phase.when]}</h2>
          <ul className="steps">
            {phase.steps.map(s => (
              <li key={s.id} className={s.done ? "step is-done" : "step"}>
                <label className="tick">
                  <input type="checkbox" checked={s.done} disabled={!s.mine || locked} onChange={e => tick(s.id, e.target.checked)} />
                  <span className="box" aria-hidden="true" />
                  <span className="step-text">
                    {s.text}
                    <span className="step-who">
                      <Portrait name={s.assigneeName} photo={s.assigneePhoto} size={22} />
                      <span className={s.assignee ? undefined : s.waiting ? "waiting" : "nobody"}>{s.assigneeName}</span>
                      {s.role && <span className="muted">({s.role})</span>}
                      {s.doneBy && <span className="muted">· {s.doneBy}</span>}
                    </span>
                  </span>
                </label>
                <span className={"due " + s.state}>{!s.done && s.state === "late" ? t.journey.late : !s.done && s.state === "today" ? t.journey.today : s.dueLabel}</span>
                {hr && !locked && (
                  <button type="button" className="icon-button" aria-expanded={editing === s.id} aria-label={t.journey.give + " · " + t.journey.due + " · " + s.text} onClick={() => setEditing(editing === s.id ? null : s.id)}><Pencil /></button>
                )}
                {hr && editing === s.id && (
                  <div className="step-edit">
                    <label>
                      <span className="label">{t.journey.give}</span>
                      <select className="select" defaultValue={s.assignee ?? ""} onChange={e => update(s.id, { assignee: e.target.value || null })}>
                        <option value="">{t.nobody}</option>
                        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="label">{t.journey.due}</span>
                      <input className="field" type="date" defaultValue={s.due} min="2000-01-01" max="2100-12-31" onChange={e => e.target.value && update(s.id, { due: e.target.value })} />
                    </label>
                    <button type="button" className="button quiet small danger" onClick={() => remove(s.id, true)}><Trash />{t.journey.remove}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hr && !locked && (
        <>
          <form className="add-step" onSubmit={add}>
            <h2 className="eyebrow">{t.journey.add}</h2>
            <div className="add-row">
              <label className="grow">
                <span className="visually-hidden">{t.journey.add}</span>
                <input name="text" className="field" placeholder={t.journey.addPlaceholder} maxLength={limits.itemText} required />
              </label>
              <label>
                <span className="visually-hidden">{t.journey.give}</span>
                <select name="assignee" className="select" defaultValue="">
                  <option value="">{t.nobody}</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>
                <span className="visually-hidden">{t.journey.due}</span>
                <input name="due" className="field" type="date" defaultValue={journey.anchor} min="2000-01-01" max="2100-12-31" />
              </label>
              <button type="submit" className="button"><Plus />{t.journey.addButton}</button>
            </div>
          </form>
          <div className="row end">
            <button type="button" className="button quiet small" onClick={() => stop(true)}>{t.journey.stop}</button>
          </div>
        </>
      )}
    </div>
  );
}
