import { call, toast } from "@argentic/chest-app/client";
import { DataTable, Menu } from "@argentic/chest-ui/components";
import { useEffect, useRef, useState } from "react";
import { Chart, type ChartPoint } from "../components/chart.tsx";
import { CheckInForm } from "../components/check-in-form.tsx";
import { Check, Clock, Pencil, Shape, Trash } from "../components/icons.tsx";
import { EditKeyResult, type KrWords } from "../components/key-result-dialog.tsx";
import type { Board, Owner } from "../components/key-result-fields.tsx";
import { PersonLine } from "../components/person.tsx";
import { Confidence, Progress } from "../components/progress.tsx";
import type { KeyResultView } from "../lib/views.ts";
import { format, plural } from "../shared/format.ts";

export type ChangeEntry = { id: string; text: string; when: string; date: string };
export type HistoryEntry = { id: string; when: string; date: string; value: string; confidence: "on_track" | "at_risk" | "off_track"; note: string; by: string; undoable: boolean };
export type ChartProps = { points: ChartPoint[]; start: number; target: number; from: number; to: number; today: number; label: string; startText: string; targetText: string; fromText: string; toText: string; targetWord: string };

// A key result on its objective's page: its numbers, a chart of its
// check-ins (and the same as a table), the latest notes, and — for its
// owner — the check-in form.
export function KeyResultCard({ kr, history, changes, chart, openCheckIn, owners, locale, me, t, boards = [] }: { boards?: Board[]; kr: KeyResultView; me: string; history: HistoryEntry[]; changes: ChangeEntry[]; chart: ChartProps; openCheckIn: boolean; owners: Owner[]; locale: string; t: KrWords }) {
  const [checking, setChecking] = useState(openCheckIn && kr.canCheckIn);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (openCheckIn) ref.current?.scrollIntoView({ block: "start" });
  }, [openCheckIn]);
  const latest = [...history].reverse().slice(0, 4);

  // Deleting goes to the archive first: Undo from the toast brings it back.
  async function removeIt() {
    const r = await call("archiveKeyResult", { id: kr.id, archived: true });
    if (!r.ok) return;
    toast({
      id: `key-result-${kr.id}`,
      text: t.objective.keyResultRemoved,
      undo: async () => {
        const b = await call("archiveKeyResult", { id: kr.id, archived: false }, { quiet: true });
        return b.ok ? true : b.message;
      },
    });
  }

  // Taking a check-in back: from the toast (its Undo), or from the history
  // for a few minutes (the page's own "Undo" link).
  async function undoIt(id: string): Promise<true | string> {
    const r = await call("undoCheckIn", { id }, { quiet: true });
    return r.ok ? true : r.message;
  }

  async function takeBack(id: string) {
    const r = await undoIt(id);
    toast(r === true ? { id: `check-in-${kr.id}`, text: t.checkIn.undone } : { text: r, tone: "error" });
  }

  return (
    <article className="card kr-card" id={`kr-${kr.id}`} ref={ref} aria-labelledby={`krt-${kr.id}`}>
      <div className="kr-card-head">
        <h3 id={`krt-${kr.id}`}>{kr.title}</h3>
        {kr.canEdit && (
          <Menu
            label={format(t.objective.keyResultMenu, { title: kr.title })}
            items={[
              { label: t.objective.editKeyResult, icon: <Pencil />, onSelect: () => setEditing(true) },
              { label: t.objective.removeKeyResult, icon: <Trash />, tone: "danger", onSelect: () => void removeIt() },
            ]}
          />
        )}
      </div>
      <div className="meta">
        <PersonLine person={kr.owner} />
        {kr.owner.gone && <span className="tag gone">{t.objective.ownerLeft}</span>}
        <Confidence value={kr.confidence} words={t.confidence} />
        {kr.stale && <span className="tag stale"><Clock />{t.progress.stale}</span>}
        {kr.weight > 1 && <span className="tag">{plural(t.objective.weight, kr.weight, locale)}</span>}
        {kr.source !== "manual" && <span className="tag fed">{format(t.objective.fed, { tool: t.tools[kr.source.split(".")[0] as keyof typeof t.tools] })}</span>}
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
            toast({ id: `check-in-${kr.id}`, text: t.checkIn.done, undo: () => undoIt(d.checkInId) });
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
                {h.undoable && <> · <button type="button" className="link-button" onClick={() => void takeBack(h.id)}>{t.checkIn.undo}</button></>}
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
          <DataTable
            caption={format(t.objective.tableCaption, { title: kr.title })}
            rows={history}
            rowKey={h => h.id}
            rowName={h => h.date}
            columns={[
              { key: "date", label: t.objective.table.date, render: h => h.date, rowHeader: true },
              { key: "value", label: t.objective.table.value, render: h => h.value },
              { key: "confidence", label: t.objective.table.confidence, render: h => t.confidence[h.confidence] },
              { key: "note", label: t.objective.table.note, render: h => h.note },
              { key: "by", label: t.objective.table.by, render: h => h.by },
            ]}
            labels={t.tables}
          />
        </details>
      )}
      {editing && <EditKeyResult kr={kr} owners={owners} boards={boards} locale={locale} t={t} onClose={() => setEditing(false)} />}
    </article>
  );
}
