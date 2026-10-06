import { call, toast } from "@argentic/chest-app/client";
import { StatusBadge } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Lock, Pencil, Plus, Trash } from "../components/icons.tsx";
import { WorkPicker, type PickerProject } from "../components/work-picker.tsx";
import { format } from "../i18n/format.ts";
import { formatDuration, parseDuration } from "../shared/duration.ts";
import { readWork, workValue } from "../shared/work.ts";
import type { DayInfo, DayItem, WeekWords } from "./WeekView.tsx";

// The list of one day: each entry with its project, task, note and time,
// to change or delete (with Undo); "Add time" for what the timer missed.
export function DayPanel({ day, total, items, projects, lock, t }: { day: DayInfo; total: number; items: DayItem[]; projects: PickerProject[]; lock: { text: string; short: string } | null; t: WeekWords }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = items.filter(e => !hidden.includes(e.id));

  async function remove(e: DayItem) {
    setHidden(h => [...h, e.id]);
    const r = await call("deleteEntry", { id: e.id });
    if (!r.ok) return setHidden(h => h.filter(x => x !== e.id));
    toast({
      id: `entry-${e.id}`,
      text: t.day.deleted,
      undo: async () => {
        const u = await call("restoreEntries", { ids: [e.id] }, { quiet: true });
        if (!u.ok) return u.message;
        setHidden(h => h.filter(x => x !== e.id));
        return true;
      },
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
              <div>
                <p className="entry-what"><strong>{e.projectName}</strong>{e.taskName && <span className="k"> · {e.taskName}</span>}</p>
                <p className="entry-client">{e.clientName ?? t.work.noClient}</p>
                {e.note && <p className="entry-note">{e.note}</p>}
              </div>
              <div className="entry-side">
                <span className="num entry-time">{formatDuration(e.minutes)}</span>
                {e.span && <span className="entry-span num" title={t.day.fromTimer}>{e.span}</span>}
                {!e.billable && <StatusBadge tone="neutral" size="s" icon={false} label={t.day.notBillable} />}
                {e.invoiced && <StatusBadge tone="ok" size="s" label={t.day.invoiced} />}
              </div>
              <div className="entry-actions">
                {e.locked ? <StatusBadge tone="neutral" size="s" icon={<Lock />} label={t.day.lockedEntry} /> : (
                  <>
                    {/* Words beside the icons: a phone has no tooltip. */}
                    <button type="button" className="button link" aria-label={format(t.day.editLabel, { name: e.projectName })} onClick={() => setEditing(e.id)}><Pencil /><span aria-hidden="true">{t.day.edit}</span></button>
                    <button type="button" className="button link" aria-label={format(t.day.deleteLabel, { name: e.projectName })} onClick={() => void remove(e)}><Trash /><span aria-hidden="true">{t.day.delete}</span></button>
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
  const [work, setWork] = useState(entry ? workValue(entry) : "");
  const [duration, setDuration] = useState(entry ? formatDuration(entry.minutes) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const project = projects.find(p => p.id === readWork(work)?.projectId);
  // An entry of a project no longer offered keeps its project.
  const list = entry && !project ? [{ id: entry.projectId, name: entry.projectName, clientName: entry.clientName, color: entry.color, billable: entry.billable, tasks: entry.taskId && entry.taskName ? [{ id: entry.taskId, name: entry.taskName }] : [] }, ...projects] : projects;
  const canBill = project ? project.billable : entry?.billable ?? false;

  async function save() {
    const w = readWork(work);
    const minutes = parseDuration(duration);
    if (!w) return setError(t.timer.pickFirst);
    if (!minutes) return setError(t.errors.bad_duration);
    setError(null);
    // The duration as typed: the server reads it again.
    const input = { ...w, day, duration, note, billable: canBill && billable };
    setPending(true);
    const r = entry ? await call("updateEntry", { id: entry.id, ...input }, { quiet: true }) : await call("addEntry", input, { quiet: true });
    setPending(false);
    if (!r.ok) return setError(r.message);
    toast({ id: `entry-${entry?.id ?? "new"}`, text: entry ? t.day.saved : format(t.day.added, { duration: formatDuration(minutes) }) });
    onDone();
  }

  const idBase = entry ? "e" + entry.id : "new";
  return (
    <form className="entry-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="entry-fields">
        <div>
          <WorkPicker id={idBase + "-work"} projects={list} value={work} onChange={setWork} t={t.work} hideLabel={false} />
        </div>
        <div>
          <label className="label" htmlFor={idBase + "-duration"}>{t.day.duration}</label>
          <input id={idBase + "-duration"} className="field num" value={duration} placeholder={t.day.durationHint} autoComplete="off" maxLength={12} onChange={e => setDuration(e.target.value)} autoFocus={!entry} />
        </div>
        <div>
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
