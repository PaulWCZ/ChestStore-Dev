"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Building, Check, Person, Pipeline } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../lib/i18n/index.ts";
import type { DueState } from "../../lib/model.ts";
import type { DayStep } from "../../lib/steps.ts";
import { completeStep, reopenStep } from "./actions.ts";
import type { Teammate } from "./ui/shared.ts";
import { StepForm } from "./ui/step-box.tsx";

export type DayRow = DayStep & { state: DueState; dueLabel: string; valueLabel: string | null; canPlan?: boolean };
type Props = { rows: DayRow[]; team: Teammate[]; me: string; canAssign: boolean; today: string; locale: Locale; t: Catalogue };

// My next steps by when they are due. "Done" takes one off at once (with
// Undo) and asks, in its place, what comes next.
export function DayList({ rows, team, me, canAssign, today, t }: Props) {
  const [shown, remove] = useOptimistic(rows, (list: DayRow[], id: string) => list.filter(r => r.id !== id));
  const [asking, setAsking] = useState<DayRow | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  function done(row: DayRow) {
    start(async () => {
      remove(row.id);
      const r = await completeStep(row.id);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      toast(t.home.doneToast, { label: t.common.undo, run: () => start(async () => { setAsking(null); await reopenStep(row.id); }) });
      if (row.canPlan) setAsking(row);
    });
  }
  const groups: DueState[] = ["late", "today", "soon"];
  return (
    <div className="day-groups">
      {asking && (
        <section className="step-box editing ask" aria-labelledby="ask-title">
          <h2 id="ask-title" className="label-mono">{t.step.whatNext}</h2>
          <p className="ask-on"><Link prefetch={false} href={`/chest/${asking.on.kind === "deal" ? "deals" : "contacts"}/${asking.on.id}`}>{asking.on.title}</Link>{asking.on.company ? ` · ${asking.on.company}` : ""}</p>
          <StepForm key={asking.id} initial={null} on={asking.on.kind === "deal" ? { deal: asking.on.id } : { contact: asking.on.id }} team={team} me={me} canAssign={canAssign} today={today} onDone={() => setAsking(null)} onSkip={() => setAsking(null)} t={t} />
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
                      {row.on.kind === "deal" ? <Pipeline /> : <Person />}
                      <Link prefetch={false} href={`/chest/${row.on.kind === "deal" ? "deals" : "contacts"}/${row.on.id}`}>{row.on.title}</Link>
                      {row.on.company && <span className="muted"><Building />{row.on.company}</span>}
                    </span>
                  </div>
                  <span className="step-side">
                    <span className={`due ${row.state}`}>{row.state === "today" ? t.step.today : row.dueLabel}</span>
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

