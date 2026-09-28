"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Calendar, Check, CheckList, RepeatIcon } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import type { DueState } from "../../lib/model.ts";
import { moveCard } from "./actions.ts";

export type TaskRow = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  boardColor: string;
  columnId: string;
  due: string | null;
  dueLabel: string | null;
  state: DueState;
  checklist: { done: number; total: number };
  repeats: boolean;
  done: { id: string; name: string } | null;
};
type Words = { groups: Catalogue["home"]["groups"]; markDone: string; doneToast: string; doneRepeatToast: string; repeats: string; undo: string; errors: Catalogue["errors"]; late: string; today: string; progress: string };

// My tasks by when they are due. Ticking one moves it to its board's
// "done" column at once, with "Undo".
export function TaskGroups({ rows, order, t }: { rows: TaskRow[]; order: DueState[]; t: Words }) {
  const [shown, remove] = useOptimistic(rows, (list: TaskRow[], id: string) => list.filter(r => r.id !== id));
  const [, start] = useTransition();
  const toast = useToast();
  function done(row: TaskRow) {
    if (!row.done) return;
    const target = row.done;
    start(async () => {
      remove(row.id);
      const result = await moveCard(row.id, target.id, null, null);
      if (!result.ok) return toast(format(t.errors[result.error], result.values));
      toast(format(row.repeats ? t.doneRepeatToast : t.doneToast, { column: target.name }), { label: t.undo, run: () => start(async () => { await moveCard(row.id, row.columnId, null, null); }) });
    });
  }
  return (
    <div className="groups">
      {order.map(state => {
        const list = shown.filter(r => r.state === state);
        if (list.length === 0) return null;
        return (
          <section key={state} className={`group ${state}`} aria-labelledby={`group-${state}`}>
            <h2 id={`group-${state}`}>{t.groups[state]} <span className="chip">{list.length}</span></h2>
            <ul className="task-list">
              {list.map(row => (
                <li key={row.id} className="task">
                  {row.done ? (
                    <button type="button" className="check" onClick={() => done(row)} title={format(t.markDone, { title: row.title })}>
                      <Check /><span className="visually-hidden">{format(t.markDone, { title: row.title })}</span>
                    </button>
                  ) : <span className="check" aria-hidden="true" />}
                  <Link className="title" href={`/chest/boards/${row.boardId}?card=${row.id}`}>{row.title}</Link>
                  <span className="where">
                    {row.repeats && <span className="chip" title={t.repeats}><RepeatIcon /><span className="visually-hidden">{t.repeats}</span></span>}
                    {row.checklist.total > 0 && <span className="chip"><CheckList />{row.checklist.done}/{row.checklist.total}</span>}
                    {row.dueLabel && <span className={`chip ${row.state === "late" ? "due-late" : row.state === "today" ? "due-today" : ""}`}><Calendar />{row.state === "today" ? t.today : row.dueLabel}</span>}
                    <span className={`chip label-chip c-${row.boardColor}`}>{row.boardName}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
