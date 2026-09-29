"use client";

import { useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Calendar, Check, CheckList, RepeatIcon } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import type { DueState } from "../../lib/model.ts";
import { moveCard, updateItem } from "./actions.ts";

// A task of mine: a card given to me, or a step of a card's checklist given
// to me (a subtask: its card is named under it).
export type TaskRow = {
  kind: "card" | "step";
  id: string;
  title: string;
  cardId: string;
  cardTitle: string | null;
  boardId: string;
  boardName: string;
  boardColor: string;
  columnId: string | null;
  due: string | null;
  dueLabel: string | null;
  state: DueState;
  checklist: { done: number; total: number };
  repeats: boolean;
  done: { id: string; name: string } | null;
};
type Words = { groups: Catalogue["home"]["groups"]; markDone: string; doneToast: string; doneRepeatToast: string; stepDone: string; stepOf: string; repeats: string; errors: Catalogue["errors"]; late: string; today: string; progress: string };

// My tasks by when they are due. Ticking a card moves it to its board's
// "done" column at once, ticking a step ticks it on its card; with "Undo".
export function TaskGroups({ rows, order, t }: { rows: TaskRow[]; order: DueState[]; t: Words }) {
  const key = (r: TaskRow) => r.kind + r.id;
  const [shown, remove] = useOptimistic(rows, (list: TaskRow[], gone: string) => list.filter(r => key(r) !== gone));
  const [, start] = useTransition();
  const toast = useToast();
  const fail = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> | undefined }) => format(t.errors[r.error], r.values);
  function done(row: TaskRow) {
    if (row.kind === "step") {
      start(async () => {
        remove(key(row));
        const result = await updateItem(row.id, { done: true });
        if (!result.ok) return void toast({ text: fail(result), tone: "error" });
        // One toast per step; its Undo says whether it worked.
        toast({ id: `step-${row.id}`, text: t.stepDone, undo: async () => { const back = await updateItem(row.id, { done: false }); return back.ok || fail(back); } });
      });
      return;
    }
    if (!row.done || !row.columnId) return;
    const target = row.done, from = row.columnId;
    start(async () => {
      remove(key(row));
      const result = await moveCard(row.id, target.id, null, null);
      if (!result.ok) return void toast({ text: fail(result), tone: "error" });
      toast({ id: `done-${row.id}`, text: format(row.repeats ? t.doneRepeatToast : t.doneToast, { column: target.name }), undo: async () => { const back = await moveCard(row.id, from, null, null); return back.ok || fail(back); } });
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
                <li key={key(row)} className={`task${row.kind === "step" ? " step" : ""}`}>
                  {row.kind === "step" || row.done ? (
                    <button type="button" className="check" onClick={() => done(row)} title={format(t.markDone, { title: row.title })}>
                      <Check /><span className="visually-hidden">{format(t.markDone, { title: row.title })}</span>
                    </button>
                  ) : <span className="check" aria-hidden="true" />}
                  <span className="task-text">
                    <Link className="title" href={`/chest/boards/${row.boardId}?card=${row.cardId}`}>{row.title}</Link>
                    {row.cardTitle && <span className="small muted">{format(t.stepOf, { card: row.cardTitle })}</span>}
                  </span>
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
