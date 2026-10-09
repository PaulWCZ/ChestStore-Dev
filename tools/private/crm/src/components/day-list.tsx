import { call, toast } from "@argentic/chest-app/client";
import { useOptimistic, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import type { Locale } from "../i18n/index.ts";
import type { DayStep } from "../lib/steps.ts";
import type { DueState } from "../shared/model.ts";
import { Building, Check, Flag, Person, Pipeline, Plus } from "./icons.tsx";
import type { Teammate, Words } from "./shared.ts";
import { StepForm, type StepWords } from "./step-box.tsx";

export type DayWords = StepWords & Words<"home">;

export type DayRow = DayStep & { state: DueState; dueLabel: string; valueLabel: string | null; canPlan?: boolean };
type Props = { rows: DayRow[]; team: Teammate[]; me: string; canAssign: boolean; today: string; locale: Locale; calendar?: boolean; t: DayWords };

// My next steps by when they are due. "Done" takes one off at once (with
// Undo) and asks, in its place, what comes next.
export function DayList({ rows, team, me, canAssign, today, calendar = false, t }: Props) {
  const [shown, remove] = useOptimistic(rows, (list: DayRow[], id: string) => list.filter(r => r.id !== id));
  const [asking, setAsking] = useState<DayRow | null>(null);
  const [, start] = useTransition();
    function done(row: DayRow) {
    start(async () => {
      remove(row.id);
      const r = await call("completeStep", { id: row.id });
      if (!r.ok) return;
      // One toast per step; its Undo says whether it worked.
      toast({
        id: `step-${row.id}`,
        text: r.value.last ? t.home.doneToast : t.step.doneToast,
        undo: async () => {
          setAsking(null);
          const back = await call("reopenStep", { id: row.id }, { quiet: true });
          return back.ok ? true : back.message;
        },
      });
      if (row.canPlan && r.value.last) setAsking(row);
    });
  }
  const groups: DueState[] = ["late", "today", "soon"];
  return (
    <div className="day-groups">
      {asking && asking.on && (
        <section className="step-box editing" aria-labelledby="ask-title">
          <h2 id="ask-title" className="label-mono">{t.step.whatNext}</h2>
          <p className="ask-on"><a href={`/chest/${asking.on.kind === "deal" ? "deals" : "contacts"}/${asking.on.id}`}>{asking.on.title}</a>{asking.on.company ? ` · ${asking.on.company}` : ""}</p>
          <StepForm key={asking.id} initial={null} on={asking.on.kind === "deal" ? { deal: asking.on.id } : { contact: asking.on.id }} team={team} me={me} canAssign={canAssign} today={today} calendar={calendar} onDone={() => setAsking(null)} onSkip={() => setAsking(null)} t={t} />
        </section>
      )}
      {groups.map(state => {
        const list = shown.filter(r => r.state === state);
        if (list.length === 0) return null;
        return (
          <section key={state} className={`day-group ${state}`} aria-labelledby={`group-${state}`}>
            <h2 id={`group-${state}`} className="label-mono">{t.home.groups[state as "late" | "today" | "soon"]} <span className="count num">{list.length}</span></h2>
            <ul className="step-list">
              {list.map(row => (
                <li key={row.id} className="step-row">
                  <button type="button" className="check" onClick={() => done(row)} title={format(t.home.doneLabel, { text: row.text })}>
                    <Check /><span className="visually-hidden">{format(t.home.doneLabel, { text: row.text })}</span>
                  </button>
                  <div className="step-main">
                    <span className="step-text">{row.text}</span>
                    <span className="step-on">
                      {row.on === null ? <span className="muted"><Flag />{t.step.mine}</span> : (
                        <>
                          {row.on.kind === "deal" ? <Pipeline /> : <Person />}
                          <a href={`/chest/${row.on.kind === "deal" ? "deals" : "contacts"}/${row.on.id}`}>{row.on.title}</a>
                          {row.on.company && <span className="muted"><Building />{row.on.company}</span>}
                        </>
                      )}
                    </span>
                  </div>
                  <span className="step-side">
                    <span className={`due ${row.state}`}>{row.dueLabel}</span>
                    {row.valueLabel && <span className="num muted">{row.valueLabel}</span>}
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


// "A step for me": a to-do that is about no client ("prepare the trade
// show"), planned from My day.
export function SelfStepButton({ team, me, canAssign, today, calendar = false, t }: { team: Teammate[]; me: string; canAssign: boolean; today: string; calendar?: boolean; t: DayWords }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="link-button self-step" onClick={() => setOpen(true)}><Plus />{t.home.addStep}</button>;
  return (
    <section className="step-box editing" aria-labelledby="self-title">
      <h2 id="self-title" className="label-mono"><Flag />{t.step.selfTitle}</h2>
      <p className="muted small-text">{t.step.selfHint}</p>
      <StepForm initial={null} on={null} team={team} me={me} canAssign={canAssign} today={today} calendar={calendar} onDone={() => setOpen(false)} onSkip={null} t={t} />
    </section>
  );
}
