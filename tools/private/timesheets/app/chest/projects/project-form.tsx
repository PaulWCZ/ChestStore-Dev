"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Back, Close, Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { amountText, hoursText, parseAmount, parseHours } from "../../../lib/amounts.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { colors } from "../../../lib/model.ts";
import type { Budget, Task } from "../../../lib/projects.ts";
import { addTask, archiveProject, archiveTask, createProject, updateProject } from "../actions.ts";

type Words = { project: Catalogue["project"]; colors: Catalogue["colors"]; errors: Catalogue["errors"]; undo: string };
export type FormProject = {
  id: string | null; name: string; clientId: string | null; color: string; billable: boolean; rateCents: number | null; budget: Budget;
  everyone: boolean; people: string[]; archived: boolean; tasks: Task[];
};

// A project: its name and client, colour, billable default and rate, its
// budget, its tasks, who records time on it. One form; Save once.
export function ProjectForm({ initial, clients, people, currency, comma, defaultTasks, t }: {
  initial: FormProject; clients: { id: string; name: string }[]; people: { id: string; name: string }[]; currency: string; comma: boolean; defaultTasks: string[]; t: Words;
}) {
  const w = t.project;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial.name);
  const [client, setClient] = useState(initial.clientId ?? "");
  const [newClient, setNewClient] = useState("");
  const [color, setColor] = useState(initial.color);
  const [billable, setBillable] = useState(initial.billable);
  const [rate, setRate] = useState(initial.rateCents === null ? "" : amountText(initial.rateCents, comma));
  const [kind, setKind] = useState<Budget["kind"]>(initial.budget.kind);
  const [budget, setBudget] = useState(initial.budget.kind === "hours" ? hoursText(initial.budget.minutes, comma) : initial.budget.kind === "money" ? amountText(initial.budget.cents, comma) : "");
  const [everyone, setEveryone] = useState(initial.everyone);
  const [chosen, setChosen] = useState<string[]>(initial.people);
  const [tasks, setTasks] = useState<string[]>(initial.id ? [] : defaultTasks);
  const [taskDraft, setTaskDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const rateCents = rate.trim() === "" ? null : parseAmount(rate);
    if (rate.trim() !== "" && rateCents === null) return setError(t.errors.invalid);
    let b: Budget = { kind: "none" };
    if (kind === "hours") {
      const minutes = parseHours(budget);
      if (!minutes) return setError(t.errors.invalid);
      b = { kind: "hours", minutes };
    } else if (kind === "money") {
      const cents = parseAmount(budget);
      if (!cents) return setError(t.errors.invalid);
      b = { kind: "money", cents };
    }
    setError(null);
    const input = {
      name, color, billable, rateCents, budget: b, everyone, people: everyone ? [] : chosen,
      ...(client === "new" ? { newClient } : { clientId: client || null }),
      ...(initial.id ? {} : { tasks }),
    };
    start(async () => {
      if (initial.id) {
        const r = await updateProject(initial.id, input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(w.saved);
        router.push("/chest/projects");
      } else {
        const r = await createProject(input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(w.saved);
        router.push("/chest/projects");
      }
    });
  }

  function archive(archived: boolean) {
    if (!initial.id) return;
    const pid = initial.id;
    start(async () => {
      const r = await archiveProject(pid, archived);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(archived ? w.archived : w.unarchived, archived ? { label: t.undo, run: () => start(async () => { await archiveProject(pid, false); router.refresh(); }) } : undefined);
      router.refresh();
    });
  }

  return (
    <form className="project-form" onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="form-grid">
        <div className="field-block wide">
          <label className="label" htmlFor="p-name">{w.name}</label>
          <input id="p-name" className="field big" value={name} maxLength={80} placeholder={w.namePlaceholder} onChange={e => setName(e.target.value)} required autoFocus={!initial.id} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="p-client">{w.client}</label>
          <select id="p-client" className="field" value={client} onChange={e => setClient(e.target.value)}>
            <option value="">{w.noClient}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="new">{w.newClient}</option>
          </select>
          {client === "new" && (
            <>
              <label className="label" htmlFor="p-new-client">{w.newClientName}</label>
              <input id="p-new-client" className="field" value={newClient} maxLength={80} onChange={e => setNewClient(e.target.value)} autoFocus />
            </>
          )}
        </div>
        <fieldset className="field-block">
          <legend className="label">{w.color}</legend>
          <div className="colors">
            {colors.map(c => (
              <label key={c} className={`color-choice c-${c}`} title={t.colors[c]}>
                <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} />
                <span className="visually-hidden">{t.colors[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field-block">
          <label className="check">
            <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
            <span>{w.billable}</span>
          </label>
          <p className="hint">{w.billableHint}</p>
        </div>
        {billable && (
          <div className="field-block">
            <label className="label" htmlFor="p-rate">{format(w.rate, { currency })}</label>
            <input id="p-rate" className="field num short" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} autoComplete="off" />
            <p className="hint">{w.rateHint}</p>
          </div>
        )}
        <fieldset className="field-block">
          <legend className="label">{w.budget}</legend>
          <div className="segmented">
            {(["none", "hours", "money"] as const).map(k => (
              <label key={k} className="seg">
                <input type="radio" name="budget" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span>{k === "none" ? w.budgetNone : k === "hours" ? w.budgetHours : w.budgetMoney}</span>
              </label>
            ))}
          </div>
          {kind !== "none" && (
            <>
              <label className="label" htmlFor="p-budget">{kind === "hours" ? w.budgetHoursLabel : format(w.budgetMoneyLabel, { currency })}</label>
              <input id="p-budget" className="field num short" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} autoComplete="off" />
            </>
          )}
        </fieldset>
        {!initial.id && (
          <fieldset className="field-block wide">
            <legend className="label">{w.tasks}</legend>
            <p className="hint">{w.tasksHint}</p>
            <ul className="task-chips">
              {tasks.map(k => (
                <li key={k} className="chip">{k}<button type="button" className="chip-x" aria-label={format(w.closeTask, { name: k })} onClick={() => setTasks(list => list.filter(x => x !== k))}><Close /></button></li>
              ))}
            </ul>
            <div className="inline-form">
              <label className="visually-hidden" htmlFor="p-task">{w.taskPlaceholder}</label>
              <input id="p-task" className="field" value={taskDraft} maxLength={60} placeholder={w.taskPlaceholder} onChange={e => setTaskDraft(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = taskDraft.trim();
                  if (v && !tasks.some(x => x.toLowerCase() === v.toLowerCase())) setTasks([...tasks, v]);
                  setTaskDraft("");
                }
              }} />
              <button type="button" className="button quiet" onClick={() => { const v = taskDraft.trim(); if (v && !tasks.some(x => x.toLowerCase() === v.toLowerCase())) setTasks([...tasks, v]); setTaskDraft(""); }}><Plus />{w.addTask}</button>
            </div>
          </fieldset>
        )}
        <fieldset className="field-block wide">
          <legend className="label">{w.who}</legend>
          <div className="segmented">
            <label className="seg"><input type="radio" name="who" checked={everyone} onChange={() => setEveryone(true)} /><span>{w.whoEveryone}</span></label>
            <label className="seg"><input type="radio" name="who" checked={!everyone} onChange={() => setEveryone(false)} /><span>{w.whoChosen}</span></label>
          </div>
          {!everyone && (
            <ul className="people-checks">
              {people.map(p => (
                <li key={p.id}>
                  <label className="check">
                    <input type="checkbox" checked={chosen.includes(p.id)} onChange={e => setChosen(list => (e.target.checked ? [...list, p.id] : list.filter(x => x !== p.id)))} />
                    <span>{p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">{w.whoHint}</p>
        </fieldset>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{initial.id ? w.save : w.create}</button>
        <Link className="button link" href="/chest/projects"><Back />{w.back}</Link>
        {initial.id && <button type="button" className="button link danger-link" disabled={pending} onClick={() => archive(!initial.archived)}>{initial.archived ? w.unarchive : w.archive}</button>}
      </div>
    </form>
  );
}

// The tasks of an existing project: added and closed at once.
export function TasksEditor({ projectId, tasks, t }: { projectId: string; tasks: Task[]; t: Words }) {
  const w = t.project;
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));
  function add() {
    const name = draft.trim();
    if (!name) return;
    start(async () => {
      const r = await addTask(projectId, name);
      if (!r.ok) return fail(r.error, r.values);
      setDraft("");
      router.refresh();
    });
  }
  function toggle(task: Task) {
    start(async () => {
      const r = await archiveTask(task.id, !task.archived);
      if (!r.ok) return fail(r.error, r.values);
      router.refresh();
    });
  }
  return (
    <section className="tasks-editor" aria-labelledby="tasks-title">
      <h2 id="tasks-title" className="label">{w.tasks}</h2>
      <p className="hint">{w.tasksHint}</p>
      <ul className="task-chips">
        {tasks.map(k => (
          <li key={k.id} className={`chip${k.archived ? " closed" : ""}`}>
            {k.name}{k.archived && <span className="visually-hidden"> ({w.closedTask})</span>}
            <button type="button" className="chip-x" disabled={pending} aria-label={format(k.archived ? w.reopenTask : w.closeTask, { name: k.name })} title={format(k.archived ? w.reopenTask : w.closeTask, { name: k.name })} onClick={() => toggle(k)}>{k.archived ? <Plus /> : <Close />}</button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={e => { e.preventDefault(); add(); }}>
        <label className="visually-hidden" htmlFor="new-task">{w.taskPlaceholder}</label>
        <input id="new-task" className="field" value={draft} maxLength={60} placeholder={w.taskPlaceholder} onChange={e => setDraft(e.target.value)} />
        <button type="submit" className="button quiet" disabled={pending || !draft.trim()}><Plus />{w.addTask}</button>
      </form>
    </section>
  );
}
