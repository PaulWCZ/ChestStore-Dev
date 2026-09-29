"use client";

import { Avatar, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Chevron } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { DueState } from "../../../lib/model.ts";
import { tickItem } from "../actions.ts";

// The steps given to me, by checklist. Ticking is instant (optimistic),
// said by a toast with Undo (the kit's: it says whether the Undo worked);
// a refusal puts the step back and says why.
export type Item = { id: string; text: string; done: boolean; due: string; state: DueState };
export type Group = { id: string; title: string; person: { name: string; photo: string | null }; items: Item[] };
type Words = { whole: string; late: string; today: string; done: string; undone: string; mark: string; doneRecently: string; errors: Record<ErrorCode, string> };

export function TodoList({ groups, t }: { groups: Group[]; t: Words }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [ticked, setTicked] = useOptimistic(new Map<string, boolean>(), (state, change: { id: string; done: boolean }) => new Map(state).set(change.id, change.done));
  // Ticks (or unticks) at once on screen; resolves with the server's answer.
  const change = (id: string, done: boolean) => new Promise<true | string>(resolve => start(async () => {
    setTicked({ id, done });
    const result = await tickItem(id, done);
    resolve(result.ok ? true : format(t.errors[result.error], result.values ?? {}));
  }));
  const set = async (id: string, done: boolean) => {
    const said = await change(id, done);
    if (said !== true) return void toast({ text: said, tone: "error" });
    toast({ id: `tick-${id}`, text: done ? t.done : t.undone, undo: () => change(id, !done) });
  };
  return (
    <div className="todo-groups">
      {groups.map(g => {
        const items = g.items.map(i => ({ ...i, done: ticked.get(i.id) ?? i.done }));
        const open = items.filter(i => !i.done);
        const done = items.filter(i => i.done);
        return (
          <section key={g.id} className="todo-group" aria-labelledby={"g-" + g.id}>
            <header className="todo-head">
              <Avatar name={g.person.name} photo={g.person.photo} size="l" />
              <h2 id={"g-" + g.id}>{g.title}</h2>
              <Link className="link-button" href={`/chest/checklists/${g.id}`}>{t.whole}<Chevron /></Link>
            </header>
            <ul className="steps">
              {open.map(i => <Step key={i.id} item={i} t={t} onChange={set} />)}
            </ul>
            {done.length > 0 && (
              <>
                <h3 className="done-title">{t.doneRecently}</h3>
                <ul className="steps done">
                  {done.map(i => <Step key={i.id} item={i} t={t} onChange={set} />)}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Step({ item, t, onChange }: { item: Item; t: Words; onChange: (id: string, done: boolean) => void }) {
  return (
    <li className={item.done ? "step is-done" : "step"}>
      <label className="tick">
        <input type="checkbox" checked={item.done} onChange={e => onChange(item.id, e.target.checked)} />
        <span className="box" aria-hidden="true" />
        <span className="step-text">{item.text}</span>
      </label>
      <span className={"due " + item.state}>{item.state === "late" && !item.done ? t.late : item.state === "today" && !item.done ? t.today : item.due}</span>
    </li>
  );
}
