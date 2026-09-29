"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Play, Plus, Stop } from "../../components/icons.tsx";
import { useToast } from "../../components/toast.tsx";
import { WorkPicker, type PickerProject } from "../../components/work-picker.tsx";
import { readWork, workValue } from "../../lib/work.ts";
import { formatClock, formatDuration } from "../../lib/duration.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { format } from "../../lib/i18n/format.ts";
import { addEntry, discardTimer, restoreTimer, startTimer, stopTimer, updateTimer } from "./actions.ts";

// The one-line timer on top of every page: "What are you working on?", a
// project, Start. Running, the same line shows the clock and Stop. The
// start instant lives on the server; the clock ticks here from it.
export type RunningView = { projectId: string; taskId: string | null; note: string; startedAt: string; elapsed: number; since: string; projectName: string };
export type Forgotten = { date: string; time: string; ago: string; options: { value: string; label: string }[]; chosen: string };
type Words = { timer: Catalogue["timer"]; work: Catalogue["work"]; errors: Catalogue["errors"] };

export function TimerBar(props: { running: RunningView | null; forgotten: Forgotten | null; projects: PickerProject[]; last: string; canManage: boolean; serverNow: number; t: Words }) {
  const { t } = props;
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [pending, start] = useTransition();
  // What the person sees, ahead of the server: running since…, or idle.
  const [running, setRunning] = useState(props.running);
  const [work, setWork] = useState(props.running ? workValue(props.running) : props.last);
  const [note, setNote] = useState(props.running?.note ?? "");
  const [elapsed, setElapsed] = useState(props.running?.elapsed ?? 0);
  const skew = useRef(0);
  const title = useRef<string | null>(null);

  // The server's answer wins when it changes (another tab, another device).
  const key = props.running ? props.running.startedAt + workValue(props.running) + props.running.note : "idle";
  useEffect(() => {
    setRunning(props.running);
    if (props.running) {
      setWork(workValue(props.running));
      setNote(props.running.note);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    skew.current = props.serverNow - Date.now();
  }, [props.serverNow]);

  useEffect(() => {
    if (!running) {
      if (title.current !== null) document.title = title.current;
      return;
    }
    title.current ??= document.title;
    const tick = () => {
      const seconds = Math.max(0, Math.floor((Date.now() + skew.current - Date.parse(running.startedAt)) / 1000));
      setElapsed(seconds);
      document.title = `${formatClock(seconds)} · ${running.projectName}`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));
  const projectOf = (value: string) => props.projects.find(p => p.id === readWork(value)?.projectId);

  function begin() {
    const chosen = readWork(work);
    if (!chosen) return toast(t.timer.pickFirst);
    const before = running;
    const now = new Date(Date.now() + skew.current).toISOString();
    setRunning({ ...chosen, note, startedAt: now, elapsed: 0, since: "", projectName: projectOf(work)?.name ?? "" });
    start(async () => {
      const r = await startTimer({ ...chosen, note });
      if (!r.ok) {
        setRunning(before);
        return fail(r.error, r.values);
      }
      if (r.value.stopped) toast(format(t.timer.recorded, { duration: formatDuration(r.value.stopped.minutes), project: before?.projectName ?? "" }));
      router.refresh();
    });
  }

  function end() {
    if (!running) return;
    const before = running;
    const said = note;
    setRunning(null);
    start(async () => {
      const r = await stopTimer();
      if (!r.ok) {
        setRunning(before);
        return fail(r.error, r.values);
      }
      setNote("");
      if (r.value.entry) toast(format(t.timer.recorded, { duration: formatDuration(r.value.entry.minutes), project: before.projectName }));
      else {
        // Under a minute: nothing recorded, unless the person keeps a minute.
        const day = r.value.day;
        toast(t.timer.tooShort, { label: t.timer.keepMinute, run: () => start(async () => {
          const k = await addEntry({ projectId: before.projectId, taskId: before.taskId, day, minutes: 1, note: said });
          if (!k.ok) return fail(k.error, k.values);
          toast(format(t.timer.recorded, { duration: formatDuration(1), project: before.projectName }));
          router.refresh();
        }) });
      }
      router.refresh();
    });
  }

  function change(next: { work?: string; note?: string }) {
    if (!running) return;
    const chosen = next.work !== undefined ? readWork(next.work) : null;
    start(async () => {
      const r = await updateTimer({ ...(chosen ? { projectId: chosen.projectId, taskId: chosen.taskId } : {}), ...(next.note !== undefined ? { note: next.note } : {}) });
      if (!r.ok) fail(r.error, r.values);
      router.refresh();
    });
  }

  function drop() {
    start(async () => {
      const r = await discardTimer();
      if (!r.ok) return fail(r.error, r.values);
      setRunning(null);
      setNote("");
      const back = r.value;
      toast(t.timer.discarded, { label: t.timer.undo, run: () => start(async () => { const u = await restoreTimer(back); if (!u.ok) fail(u.error, u.values); router.refresh(); }) });
      router.refresh();
    });
  }

  if (props.projects.length === 0 && !running) {
    return (
      <section className="timer idle empty-timer" aria-label={t.timer.region}>
        <p>{props.canManage ? t.timer.noProjectsManager : t.timer.noProjects}</p>
        {/* On the Projects pages, their own button is the one to press. */}
        {props.canManage && !path.startsWith("/chest/projects") && <Link className="button signal" href="/chest/projects/new"><Plus />{t.timer.addProject}</Link>}
      </section>
    );
  }

  const color = projectOf(work)?.color ?? "teal";
  return (
    <section className={`timer ${running ? "running" : "idle"}`} aria-label={t.timer.region}>
      <form className="timer-line" onSubmit={e => { e.preventDefault(); if (running) end(); else begin(); }}>
        <span className={`swatch c-${color}`} aria-hidden="true" />
        <label htmlFor="timer-note" className="visually-hidden">{t.timer.note}</label>
        <input
          id="timer-note"
          className="timer-note"
          placeholder={t.timer.placeholder}
          value={note}
          maxLength={500}
          autoComplete="off"
          onChange={e => setNote(e.target.value)}
          onBlur={() => { if (running && note !== running.note) change({ note }); }}
          onKeyDown={e => { if (e.key === "Enter" && running) { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        />
        <WorkPicker id="timer-work" className="timer-work" projects={props.projects} value={work} t={t.work} onChange={v => { setWork(v); if (running) change({ work: v }); }} />
        <span className="timer-clock" role="timer" aria-live="off">{running ? formatClock(elapsed) : "0:00:00"}</span>
        {running ? (
          <>
            <button type="submit" className="button stop" disabled={pending}><Stop />{t.timer.stop}</button>
            <button type="button" className="button link discard" onClick={drop} disabled={pending}>{t.timer.discard}</button>
          </>
        ) : (
          <button type="submit" className="button signal" disabled={pending}><Play />{t.timer.start}</button>
        )}
      </form>
      {running && running.since && <p className="timer-since">{format(t.timer.since, { time: running.since })}</p>}
      {props.forgotten && running && <ForgottenDialog key={running.startedAt} startedAt={running.startedAt} projectName={running.projectName} forgotten={props.forgotten} t={t} onDone={() => router.refresh()} />}
    </section>
  );
}

// A timer running more than 10 hours was probably forgotten: ask when it
// really stopped, once per visit.
function ForgottenDialog({ startedAt, projectName, forgotten, t, onDone }: { startedAt: string; projectName: string; forgotten: Forgotten; t: Words; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const [at, setAt] = useState(forgotten.chosen);
  const [pending, start] = useTransition();
  const storageKey = "timesheets:kept:" + startedAt;

  useEffect(() => {
    let kept = false;
    try {
      kept = sessionStorage.getItem(storageKey) === "1";
    } catch {
      // Storage refused (private mode): ask anyway.
    }
    if (!kept && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [storageKey]);

  function close() {
    dialog.current?.close();
  }
  function save() {
    start(async () => {
      const r = await stopTimer(at === "now" ? undefined : at);
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      close();
      toast(r.value.entry ? format(t.timer.recorded, { duration: formatDuration(r.value.entry.minutes), project: projectName }) : t.timer.tooShort);
      onDone();
    });
  }
  function drop() {
    start(async () => {
      const r = await discardTimer();
      if (!r.ok) return toast(format(t.errors[r.error], r.values));
      close();
      toast(t.timer.discarded);
      onDone();
    });
  }
  function keep() {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to remember it in: it asks again next visit.
    }
    close();
  }

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="forgotten-title" onCancel={keep}>
      <h2 id="forgotten-title">{t.timer.forgotten.title}</h2>
      <p>{format(t.timer.forgotten.body, { date: forgotten.date, time: forgotten.time, ago: forgotten.ago })}</p>
      <label className="label" htmlFor="forgotten-at">{t.timer.forgotten.when}</label>
      <select id="forgotten-at" className="field" value={at} onChange={e => setAt(e.target.value)}>
        {forgotten.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="dialog-actions">
        <button type="button" className="button" disabled={pending} onClick={save}>{t.timer.forgotten.save}</button>
        <button type="button" className="button quiet" disabled={pending} onClick={drop}>{t.timer.forgotten.discard}</button>
        <button type="button" className="button link" disabled={pending} onClick={keep}>{t.timer.forgotten.keep}</button>
      </div>
    </dialog>
  );
}
