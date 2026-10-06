import { Avatar, Confirm, DateField, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, navigate, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Pencil, Plus, Trash } from "../components/icons.tsx";
import { offered } from "../shared/choices.ts";
import { limits, type DueState, type Kind } from "../shared/model.ts";

export type StepView = {
  id: string; text: string; done: boolean; due: string; dueLabel: string; state: DueState; when: "before" | "on" | "after";
  assignee: string | null; assigneeName: string; assigneePhoto: string | null; role: string; doneBy: string | null; mine: boolean; waiting: boolean;
};
type Words = {
  journey: {
    before: Record<Kind, string>; onDay: Record<Kind, string>; after: Record<Kind, string>;
    mark: string; give: string; due: string; remove: string; removed: string; add: string; addPlaceholder: string; addButton: string;
    stop: string; stoppedToast: string; stoppedBanner: string; restart: string; delete: string; deleted: string; completeBanner: string;
    deleteTitle: string; deleteBody: string; deleteConfirm: string; cancel: string;
    late: string; today: string; saved: string;
  };
  todo: { done: string; undone: string };
  nobody: string;
  leaveEmpty: string;
  date: DateWords;
  peoplePicker: PeoplePickerWords;
};
type Person = { id: string; name: string; photo: string | null };
type Said = { ok: true } | { ok: false; message: string };

// One checklist, as HR and the people with a step see it. Ticking, giving
// a step to someone, moving its day, deleting it are instant, said by a
// toast — with Undo when it can be undone (the kit's: it says whether the
// Undo worked). Deleting a stopped checklist is for good: it asks first.
// A tick on its way is shown over the page's props until the page read
// again after it arrives (call() refreshes it).
export function JourneyView({ journey, steps, hr, people, today, lang, t }: {
  journey: { id: string; kind: Kind; anchor: string; stopped: boolean; complete: boolean };
  steps: StepView[];
  hr: boolean;
  people: Person[];
  // Today in the Chest's time zone (the date fields), the words' language.
  today: string;
  lang: string;
  t: Words;
}) {
  const uid = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [ticked, setTicked] = useState<ReadonlyMap<string, boolean>>(new Map());
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const text = (r: Said): true | string => (r.ok ? true : r.message);
  const fail = (said: true | string) => { if (said !== true) toast({ text: said, tone: "error" }); return said === true; };
  // Runs a change (quiet: a refusal is said once, by fail()), resolves with
  // the answer once the page is read again.
  const run = async (step: () => Promise<Said>) => text(await step());

  const tick = async (id: string, done: boolean) => {
    const set = async (d: boolean) => {
      setTicked(m => new Map(m).set(id, d));
      const said = await run(() => call("tickItem", { id, done: d }, { quiet: true }));
      setTicked(m => { const n = new Map(m); n.delete(id); return n; });
      return said;
    };
    if (fail(await set(done))) toast({ id: `tick-${id}`, text: done ? t.todo.done : t.todo.undone, undo: () => set(!done) });
  };
  const remove = async (id: string) => {
    setEditing(null);
    if (fail(await run(() => call("removeChecklistItem", { id, removed: true }, { quiet: true })))) toast({ id: `step-${id}`, text: t.journey.removed, undo: () => run(() => call("removeChecklistItem", { id, removed: false }, { quiet: true })) });
  };
  const update = async (id: string, input: { assignee?: string | null; due?: string }) => {
    if (fail(await run(() => call("updateChecklistItem", { id, ...input }, { quiet: true })))) toast({ id: `step-${id}`, text: t.journey.saved });
  };
  const stop = async (stopped: boolean) => {
    if (!fail(await run(() => call("stopChecklist", { id: journey.id, stopped }, { quiet: true })))) return;
    if (stopped) toast({ id: `stop-${journey.id}`, text: t.journey.stoppedToast, undo: () => run(() => call("stopChecklist", { id: journey.id, stopped: false }, { quiet: true })) });
  };
  const destroy = async () => {
    setAsking(false);
    if (fail(await run(() => call("deleteChecklist", { id: journey.id }, { quiet: true, refresh: false })))) {
      toast({ id: `deleted-${journey.id}`, text: t.journey.deleted });
      await navigate("/chest/checklists");
    }
  };

  // The new step's day, refused by its field (kit 0.2.4), leaves the previous
  // one in `adding.due`: the step waits. (A step's own day saves on each
  // change: a refused day is never sent, and the field says why.)
  const addDates = useDateProblems();
  const [adding, setAdding] = useState({ text: "", assignee: [] as Person[], due: journey.anchor as string | null });
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adding.text.trim() || !adding.due || addDates.problem) return;
    void run(() => call("addChecklistItem", { id: journey.id, text: adding.text, assignee: adding.assignee[0]?.id ?? null, due: adding.due! }, { quiet: true })).then(said => {
      if (fail(said)) setAdding(a => ({ ...a, text: "" }));
    });
  };

  const shown = steps.map(s => ({ ...s, done: ticked.get(s.id) ?? s.done }));
  const phases = (["before", "on", "after"] as const).map(when => ({ when, steps: shown.filter(s => s.when === when) })).filter(p => p.steps.length > 0);
  const title = { before: t.journey.before[journey.kind], on: t.journey.onDay[journey.kind], after: t.journey.after[journey.kind] };
  const locked = journey.stopped;
  const picker = { search: searchPeople, suggestions: offered(people), labels: t.peoplePicker, lang, hint: t.leaveEmpty };
  const chosen = (id: string | null) => people.filter(p => p.id === id);
  return (
    <div className="journey">
      {journey.stopped && (
        <div className="banner warn">
          <span>{t.journey.stoppedBanner}</span>
          {hr && (
            <span className="row">
              <button type="button" className="button small" onClick={() => void stop(false)}>{t.journey.restart}</button>
              <button type="button" className="button quiet small danger" onClick={() => setAsking(true)}><Trash />{t.journey.delete}</button>
            </span>
          )}
        </div>
      )}
      <Confirm open={asking} title={t.journey.deleteTitle} body={t.journey.deleteBody} confirmLabel={t.journey.deleteConfirm} cancelLabel={t.journey.cancel} onConfirm={() => void destroy()} onCancel={() => setAsking(false)} />
      {!journey.stopped && shown.length > 0 && shown.every(s => s.done) && <p className="banner ok">{t.journey.completeBanner}</p>}
      {phases.map(phase => (
        <section key={phase.when} className="phase" aria-labelledby={uid + phase.when}>
          <h2 id={uid + phase.when} className="eyebrow">{title[phase.when]}</h2>
          <ul className="steps">
            {phase.steps.map(s => (
              <li key={s.id} className={s.done ? "step is-done" : "step"}>
                <label className="tick">
                  <input type="checkbox" checked={s.done} disabled={!s.mine || locked} onChange={e => void tick(s.id, e.target.checked)} />
                  <span className="box" aria-hidden="true" />
                  <span className="step-text">
                    {s.text}
                    <span className="step-who">
                      <Avatar name={s.assigneeName} photo={s.assigneePhoto} size="s" />
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
                    <div className="step-edit-field">
                      <PeoplePicker label={t.journey.give} clearable value={chosen(s.assignee)} onChange={c => void update(s.id, { assignee: c[0]?.id ?? null })} {...picker} />
                    </div>
                    <div className="step-edit-field">
                      <DateField label={t.journey.due} value={s.due} today={today} min="2000-01-01" max="2100-12-31" labels={t.date} chips={false} onChange={day => { if (day && day !== s.due) void update(s.id, { due: day }); }} />
                    </div>
                    <button type="button" className="button quiet small danger" onClick={() => void remove(s.id)}><Trash />{t.journey.remove}</button>
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
            <h2 className="eyebrow" id={uid + "add"}>{t.journey.add}</h2>
            <div className="add-row">
              <label className="grow">
                <span className="visually-hidden">{t.journey.add}</span>
                <input name="text" className="field" placeholder={t.journey.addPlaceholder} maxLength={limits.itemText} required value={adding.text} onChange={e => setAdding(a => ({ ...a, text: e.target.value }))} />
              </label>
              <div className="add-field">
                <PeoplePicker label={t.journey.give} clearable value={adding.assignee} onChange={c => setAdding(a => ({ ...a, assignee: c }))} {...picker} />
              </div>
              <div className="add-field">
                <WatchedDateField label={t.journey.due} value={adding.due} today={today} min="2000-01-01" max="2100-12-31" labels={t.date} chips={false} onProblem={addDates.watch("due")} onChange={day => setAdding(a => ({ ...a, due: day }))} />
              </div>
              <button type="submit" className="button" disabled={addDates.problem !== null}><Plus />{t.journey.addButton}</button>
            </div>
          </form>
          <div className="row end">
            <button type="button" className="button quiet small" onClick={() => void stop(true)}>{t.journey.stop}</button>
          </div>
        </>
      )}
    </div>
  );
}
