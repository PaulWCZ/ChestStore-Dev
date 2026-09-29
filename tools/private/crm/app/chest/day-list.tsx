"use client";

import { useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Building, Check, Flag, Person, Pipeline, Plus } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../lib/i18n/index.ts";
import type { DueState } from "../../lib/model.ts";
import type { DayStep } from "../../lib/steps.ts";
import { completeStep, reopenStep } from "./actions.ts";
import type { Teammate } from "./ui/shared.ts";
import { StepForm } from "./ui/step-box.tsx";

export type DayRow = DayStep & { state: DueState; dueLabel: string; valueLabel: string | null; canPlan?: boolean };
type Props = { rows: DayRow[]; team: Teammate[]; me: string; canAssign: boolean; today: string; locale: Locale; calendar?: boolean; t: Catalogue };

// My next steps by when they are due. "Done" takes one off at once (with
// Undo) and asks, in its place, what comes next.
export function DayList({ rows, team, me, canAssign, today, calendar = false, t }: Props) {
  const [shown, remove] = useOptimistic(rows, (list: DayRow[], id: string) => list.filter(r => r.id !== id));
  const [asking, setAsking] = useState<DayRow | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  function done(row: DayRow) {
    start(async () => {
      remove(row.id);
      const r = await completeStep(row.id);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      // One toast per step; its Undo says whether it worked.
      toast({
        id: `step-${row.id}`,
        text: r.value.last ? t.home.doneToast : t.step.doneToast,
        undo: async () => {
          setAsking(null);
          const back = await reopenStep(row.id);
          return back.ok ? true : format(t.errors[back.error], back.values);
        },
      });
      if (row.canPlan && r.value.last) setAsking(row);
    });
  }
  const groups: DueState[] = ["late", "today", "soon"];
  return (
    <div className="day-groups">
      {asking && asking.on && (
        <section className="step-box editing ask" aria-labelledby="ask-title">
          <h2 id="ask-title" className="label-mono">{t.step.whatNext}</h2>
          <p className="ask-on"><Link prefetch={false} href={`/chest/${asking.on.kind === "deal" ? "deals" : "contacts"}/${asking.on.id}`}>{asking.on.title}</Link>{asking.on.company ? ` · ${asking.on.company}` : ""}</p>
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
                          <Link prefetch={false} href={`/chest/${row.on.kind === "deal" ? "deals" : "contacts"}/${row.on.id}`}>{row.on.title}</Link>
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
export function SelfStepButton({ team, me, canAssign, today, calendar = false, t }: { team: Teammate[]; me: string; canAssign: boolean; today: string; calendar?: boolean; t: Catalogue }) {
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
