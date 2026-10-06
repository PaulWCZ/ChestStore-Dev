import { useOptimistic, useTransition } from "react";
import { Calendar, Check, CheckList, RepeatIcon } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import type { DueState } from "../shared/model.ts";

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
type Words = { groups: Catalogue["home"]["groups"]; markDone: string; doneAnyway: string; doneToast: string; doneRepeatToast: string; stepDone: string; stepOf: string; repeats: string; late: string; today: string; progress: string };

// My tasks by when they are due. Ticking a card moves it to its board's
// "done" column at once, ticking a step ticks it on its card; with "Undo".
export function TaskGroups({ rows, order, t }: { rows: TaskRow[]; order: DueState[]; t: Words }) {
  const key = (r: TaskRow) => r.kind + r.id;
  const [shown, remove] = useOptimistic(rows, (list: TaskRow[], gone: string) => list.filter(r => key(r) !== gone));
  const [, start] = useTransition();
  // A refusal's toast is call()'s (in the reader's words); an Undo's
  // refusal is said by the Undo's own toast.
  function done(row: TaskRow) {
    if (row.kind === "step") {
      start(async () => {
        remove(key(row));
        const result = await call("updateItem", { id: row.id, done: true });
        if (!result.ok) return;
        // One toast per step; its Undo says whether it worked.
        toast({ id: `step-${row.id}`, text: t.stepDone, undo: async () => { const back = await call("updateItem", { id: row.id, done: false }, { quiet: true }); return back.ok || back.message; } });
      });
      return;
    }
    if (!row.done || !row.columnId) return;
    const target = row.done, from = row.columnId;
    start(async () => {
      remove(key(row));
      const result = await call("moveCard", { id: row.id, column: target.id }, { quiet: true });
      // A card that waits for others: said, with "Mark done anyway".
      if (!result.ok && result.error === "blocked") return void toast({ id: `done-${row.id}`, text: result.message, tone: "error", action: { label: t.doneAnyway, run: () => start(async () => { remove(key(row)); await call("moveCard", { id: row.id, column: target.id, force: true }); }) } });
      if (!result.ok) return void toast({ text: result.message, tone: "error" });
      toast({ id: `done-${row.id}`, text: format(row.repeats ? t.doneRepeatToast : t.doneToast, { column: target.name }), undo: async () => { const back = await call("moveCard", { id: row.id, column: from }, { quiet: true }); return back.ok || back.message; } });
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
                    <a className="title" href={`/chest/boards/${row.boardId}?card=${row.cardId}`}>{row.title}</a>
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
