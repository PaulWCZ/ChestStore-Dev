"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock, Pencil, Plus, Trash } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { WorkPicker, type PickerProject } from "../../components/work-picker.tsx";
import { readWork, workValue } from "../../lib/work.ts";
import { formatDuration, parseDuration } from "../../lib/duration.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { addEntry, deleteEntry, restoreEntries, updateEntry } from "./actions.ts";
import type { DayInfo, DayItem, WeekWords } from "./week-view.tsx";

// The list of one day: each entry with its project, task, note and time,
// to change or delete (with Undo); "Add time" for what the timer missed.
export function DayPanel({ day, total, items, projects, lock, t }: { day: DayInfo; total: number; items: DayItem[]; projects: PickerProject[]; lock: { text: string; short: string } | null; t: WeekWords }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [, start] = useTransition();
  const shown = items.filter(e => !hidden.includes(e.id));
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));

  function remove(e: DayItem) {
    setHidden(h => [...h, e.id]);
    start(async () => {
      const r = await deleteEntry(e.id);
      if (!r.ok) {
        setHidden(h => h.filter(x => x !== e.id));
        return fail(r.error, r.values);
      }
      toast(t.day.deleted, {
        label: t.timer.undo,
        run: () => start(async () => {
          const u = await restoreEntries([e.id]);
          if (!u.ok) fail(u.error, u.values);
          setHidden(h => h.filter(x => x !== e.id));
          router.refresh();
        }),
      });
    });
  }

  return (
    <section className="day-panel" aria-labelledby="day-title">
      <header className="day-panel-head">
        <h2 id="day-title">{day.long}</h2>
        <span className="day-total"><span className="visually-hidden">{t.day.total} </span><span className="num">{formatDuration(total)}</span></span>
      </header>
      {day.locked && lock && <p className="notice small"><Lock /><span>{lock.text}</span></p>}
      {shown.length > 0 ? (
        <ul className="entries">
          {shown.map(e => editing === e.id ? (
            <li key={e.id} className="entry editing">
              <EntryForm day={day.day} entry={e} projects={projects} t={t} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={e.id} className="entry">
              <span className={`bar c-${e.color}`} aria-hidden="true" />
              <div className="entry-main">
                <p className="entry-what"><strong>{e.projectName}</strong>{e.taskName && <span className="k"> · {e.taskName}</span>}</p>
                <p className="entry-client">{e.clientName ?? t.work.noClient}</p>
                {e.note && <p className="entry-note">{e.note}</p>}
              </div>
              <div className="entry-side">
                <span className="num entry-time">{formatDuration(e.minutes)}</span>
                {e.span && <span className="entry-span num" title={t.day.fromTimer}>{e.span}</span>}
                {!e.billable && <span className="tag">{t.day.notBillable}</span>}
                {e.invoiced && <span className="tag">{t.day.invoiced}</span>}
              </div>
              <div className="entry-actions">
                {e.locked ? <span className="tag"><Lock />{t.day.lockedEntry}</span> : (
                  <>
                    <button type="button" className="button icon link" aria-label={format(t.day.editLabel, { name: e.projectName })} title={t.day.edit} onClick={() => setEditing(e.id)}><Pencil /></button>
                    <button type="button" className="button icon link" aria-label={format(t.day.deleteLabel, { name: e.projectName })} title={t.day.delete} onClick={() => remove(e)}><Trash /></button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted day-empty">{t.day.empty}</p>}
      {!day.locked && projects.length > 0 && (editing === "new"
        ? <div className="entry editing"><EntryForm day={day.day} projects={projects} t={t} onDone={() => setEditing(null)} /></div>
        : <button type="button" className="button add-time" onClick={() => setEditing("new")}><Plus />{t.day.add}</button>)}
    </section>
  );
}

function EntryForm({ day, entry, projects, t, onDone }: { day: string; entry?: DayItem; projects: PickerProject[]; t: WeekWords; onDone: () => void }) {
  const toast = useToast();
  const [work, setWork] = useState(entry ? workValue(entry) : "");
  const [duration, setDuration] = useState(entry ? formatDuration(entry.minutes) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const project = projects.find(p => p.id === readWork(work)?.projectId);
  // An entry of a project no longer offered keeps its project.
  const list = entry && !project ? [{ id: entry.projectId, name: entry.projectName, clientName: entry.clientName, color: entry.color, billable: entry.billable, tasks: entry.taskId && entry.taskName ? [{ id: entry.taskId, name: entry.taskName }] : [] }, ...projects] : projects;
  const canBill = project ? project.billable : entry?.billable ?? false;

  function save() {
    const w = readWork(work);
    const minutes = parseDuration(duration);
    if (!w) return setError(t.timer.pickFirst);
    if (!minutes) return setError(t.errors.bad_duration);
    setError(null);
    const input = { ...w, day, minutes, note, billable: canBill && billable };
    start(async () => {
      const r = entry ? await updateEntry(entry.id, input) : await addEntry(input);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      toast(entry ? t.day.saved : format(t.day.added, { duration: formatDuration(minutes) }));
      onDone();
    });
  }

  const idBase = entry ? "e" + entry.id : "new";
  return (
    <form className="entry-form" onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="entry-fields">
        <div className="f-work">
          <WorkPicker id={idBase + "-work"} projects={list} value={work} onChange={setWork} t={t.work} hideLabel={false} />
        </div>
        <div className="f-duration">
          <label className="label" htmlFor={idBase + "-duration"}>{t.day.duration}</label>
          <input id={idBase + "-duration"} className="field num" value={duration} placeholder={t.day.durationHint} autoComplete="off" maxLength={12} onChange={e => setDuration(e.target.value)} autoFocus={!entry} />
        </div>
        <div className="f-note">
          <label className="label" htmlFor={idBase + "-note"}>{t.day.note}</label>
          <input id={idBase + "-note"} className="field" value={note} placeholder={t.day.notePlaceholder} maxLength={500} onChange={e => setNote(e.target.value)} />
        </div>
      </div>
      {canBill && (
        <label className="check">
          <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
          <span>{t.day.billable}</span>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{t.day.save}</button>
        <button type="button" className="button link" onClick={onDone}>{t.day.cancel}</button>
      </div>
    </form>
  );
}
