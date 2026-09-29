"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Chart, type ChartPoint } from "../../../../components/chart.tsx";
import { Check, Clock, Dots, Pencil, Trash } from "../../../../components/icons.tsx";
import { PersonLine } from "../../../../components/person.tsx";
import { Confidence, Progress } from "../../../../components/progress.tsx";
import { Shape } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { KeyResultView } from "../../../../lib/views.ts";
import { archiveKeyResult, undoCheckIn } from "../../actions.ts";
import { CheckInForm } from "../../views/check-in-form.tsx";
import { EditKeyResult, type KrWords } from "./key-result-dialog.tsx";

export type ChangeEntry = { id: string; text: string; when: string; date: string };
export type HistoryEntry = { id: string; when: string; date: string; value: string; confidence: "on_track" | "at_risk" | "off_track"; note: string; by: string; undoable: boolean };
type ChartProps = { points: ChartPoint[]; start: number; target: number; from: number; to: number; today: number; label: string; startText: string; targetText: string; fromText: string; toText: string; targetWord: string };

// A key result on its objective's page: its numbers, a chart of its
// check-ins (and the same as a table), the latest notes, and — for its
// owner — the check-in form.
export function KeyResultCard({ kr, history, changes, chart, openCheckIn, owners, locale, me, t }: { kr: KeyResultView; me: string; history: HistoryEntry[]; changes: ChangeEntry[]; chart: ChartProps; openCheckIn: boolean; owners: { id: string; name: string }[]; locale: string; t: KrWords }) {
  const [checking, setChecking] = useState(openCheckIn && kr.canCheckIn);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (openCheckIn) ref.current?.scrollIntoView({ block: "start" });
  }, [openCheckIn]);
  const latest = [...history].reverse().slice(0, 4);
  const words = (code: keyof typeof t.errors, values: Record<string, string | number> = {}) => format(t.errors[code], values);

  function removeIt() {
    start(async () => {
      const r = await archiveKeyResult(kr.id, true);
      if (!r.ok) return toast(words(r.error, r.values));
      toast(t.objective.keyResultRemoved, { label: t.checkIn.undo, run: () => start(async () => { const b = await archiveKeyResult(kr.id, false); if (!b.ok) toast(words(b.error, b.values)); router.refresh(); }) });
      router.refresh();
    });
  }

  function takeBack(id: string) {
    start(async () => {
      const r = await undoCheckIn(id);
      toast(r.ok ? t.checkIn.undone : words(r.error, r.values));
      router.refresh();
    });
  }

  return (
    <article className="card kr-card" id={`kr-${kr.id}`} ref={ref} aria-labelledby={`krt-${kr.id}`}>
      <div className="kr-card-head">
        <h3 id={`krt-${kr.id}`}>{kr.title}</h3>
        {kr.canEdit && (
          <details className="menu">
            <summary className="icon-button" aria-label={format(t.objective.keyResultMenu, { title: kr.title })}><Dots /></summary>
            <div className="menu-list">
              <button type="button" onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setEditing(true); }}><Pencil />{t.objective.editKeyResult}</button>
              <button type="button" className="danger" onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; removeIt(); }}><Trash />{t.objective.removeKeyResult}</button>
            </div>
          </details>
        )}
      </div>
      <div className="meta">
        <PersonLine person={kr.owner} size={22} />
        {kr.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}
        <Confidence value={kr.confidence} words={t.confidence} />
        {kr.stale && <span className="tag stale"><Clock />{t.progress.stale}</span>}
        {kr.weight > 1 && <span className="tag">{plural(t.objective.weight, kr.weight, locale)}</span>}
        {kr.source !== "manual" && <span className="tag fed">{t.objective.fed}</span>}
      </div>
      <Progress percent={kr.percent} text={kr.percentText} label={`${kr.title}: ${kr.percentText}`} confidence={kr.confidence} big />
      <div className="kr-numbers">
        {kr.kind === "milestone" ? (
          <span><strong>{kr.current}</strong></span>
        ) : (
          <>
            <span>{t.objective.start}<strong>{kr.start}</strong></span>
            <span>{t.checkIn.newValue}<strong>{kr.current}</strong></span>
            <span>{t.objective.targetLine}<strong>{kr.target}</strong></span>
          </>
        )}
        <span>{t.objective.lastCheckInLabel}<strong className="small-strong" title={kr.lastCheckInDate ?? undefined}>{kr.lastCheckIn ?? t.objective.never}</strong></span>
      </div>

      {kr.canCheckIn && !checking && <div>{kr.owner.id === me ? <button type="button" className="button go" onClick={() => setChecking(true)}><Check />{t.checkIn.open}</button> : <button type="button" className="button quiet small" onClick={() => setChecking(true)}>{format(t.objective.checkInFor, { name: kr.owner.name })}</button>}</div>}
      {checking && (
        <CheckInForm
          inline
          kr={kr}
          t={t}
          onCancel={() => setChecking(false)}
          onDone={d => {
            setChecking(false);
            toast(t.checkIn.done, { label: t.checkIn.undo, run: () => takeBack(d.checkInId) });
            router.refresh();
          }}
        />
      )}

      {history.length > 0 && kr.kind !== "milestone" && <Chart {...chart} />}
      {latest.length > 0 && (
        <ul className="history" aria-label={t.objective.history}>
          {latest.map(h => (
            <li key={h.id}>
              <span className={`shape-${h.confidence}`}><Shape confidence={h.confidence} /></span>
              <span><strong>{h.value}</strong> · <span className="when" title={h.date}>{h.when}</span> · {h.by}
                {h.undoable && <> · <button type="button" className="link-button" onClick={() => takeBack(h.id)}>{t.checkIn.undo}</button></>}
              </span>
              {h.note && <span className="note">{h.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {changes.length > 0 && (
        <ul className="changes" aria-label={t.objective.changes}>
          {changes.map(c => <li key={c.id}><Pencil /><span>{c.text} · <span className="when" title={c.date}>{c.when}</span></span></li>)}
        </ul>
      )}
      {history.length > 0 && (
        <details className="table-alt">
          <summary>{t.objective.showTable}</summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th scope="col">{t.objective.table.date}</th><th scope="col">{t.objective.table.value}</th><th scope="col">{t.objective.table.confidence}</th><th scope="col">{t.objective.table.note}</th><th scope="col">{t.objective.table.by}</th></tr></thead>
              <tbody>
                {history.map(h => <tr key={h.id}><td>{h.date}</td><td>{h.value}</td><td>{t.confidence[h.confidence]}</td><td>{h.note}</td><td>{h.by}</td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {editing && <EditKeyResult kr={kr} owners={owners} locale={locale} t={t} onClose={() => setEditing(false)} />}
    </article>
  );
}
