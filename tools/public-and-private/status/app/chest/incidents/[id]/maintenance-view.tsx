"use client";

import { useRef, useState } from "react";
import type { PickerGroup } from "../../../../components/component-picker.tsx";
import { useRun } from "../../../../components/use-run.ts";
import { changeMaintenance, postMaintenanceUpdate } from "../../actions.ts";
import { MaintenanceFields, type WindowValue } from "../../maintenance/maintenance-fields.tsx";
import { Head, RemoveIncident, type Words } from "./incident-view.tsx";
import { TimelineView, type UpdateView } from "./timeline-view.tsx";

// A maintenance for editors: its window (planned, in progress, completed —
// read from the clock), news to post during it, finish early or cancel,
// and the window to change while it has not ended.
export function MaintenanceView({ incident, form, updates, publicLink, t }: {
  incident: { id: string; title: string; phase: string; window: string; affected: string[]; autoPosts: boolean; removed: string | null };
  form: { start: { day: string; minutes: number }; end: { day: string; minutes: number }; components: string[]; groups: PickerGroup[]; zoneNote: string };
  updates: UpdateView[];
  publicLink: string;
  t: Words;
}) {
  const w = t.maintenance;
  const { run, pending } = useRun(t.errors);
  const open = incident.phase === "scheduled" || incident.phase === "in_progress";
  const [body, setBody] = useState("");
  const [ending, setEnding] = useState<{ status: "completed" | "cancelled"; text: string } | null>(null);
  const [value, setValue] = useState<WindowValue>({ title: incident.title, start: form.start, end: form.end, components: form.components, autoPosts: incident.autoPosts });
  const dialog = useRef<HTMLDialogElement>(null);
  const phaseWord: Record<string, string> = { scheduled: w.phaseScheduled!, in_progress: w.phaseInProgress!, completed: w.phaseCompleted!, cancelled: w.phaseCancelled! };

  const ask = (status: "completed" | "cancelled") => {
    setEnding({ status, text: status === "completed" ? w.finishText! : w.cancelText! });
    dialog.current?.showModal();
  };

  return (
    <main className="narrow stack-l">
      <Head id={incident.id} title={incident.title} chip={phaseWord[incident.phase] ?? ""} chipClass={`step-${incident.phase}`} publicLink={publicLink} removed={incident.removed} t={t} />
      <p className="window-line"><strong>{incident.window}</strong>{incident.affected.length > 0 && <> · {incident.affected.join(", ")}</>}</p>
      {incident.autoPosts && <p className="hint">{w.autoOn}</p>}

      {open && !incident.removed && (
        <section className="card pad stack" aria-labelledby="post-title">
          <div className="section-head">
            <h2 id="post-title">{w.post}</h2>
            <div className="actions">
              {incident.phase === "in_progress" && <button type="button" className="button resolve" onClick={() => ask("completed")}>{w.finish}</button>}
              <button type="button" className="button quiet" onClick={() => ask("cancelled")}>{w.cancelIt}</button>
            </div>
          </div>
          <form className="stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => postMaintenanceUpdate(incident.id, { status: "update", body }), t.incident.updated); if (r.ok) setBody(""); }}>
            <label className="visually-hidden" htmlFor="m-body">{w.post}</label>
            <textarea id="m-body" className="field" required rows={3} maxLength={5000} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} />
            <div><button type="submit" className="button" disabled={pending}>{t.incident.submitUpdate}</button></div>
          </form>
        </section>
      )}

      {open && !incident.removed && (
        <details className="card pad">
          <summary className="summary-button">{w.change}</summary>
          <form className="stack form" onSubmit={e => { e.preventDefault(); void run(() => changeMaintenance(incident.id, value), w.changed); }}>
            <MaintenanceFields value={value} onChange={setValue} groups={form.groups} zoneNote={form.zoneNote} t={t} />
            <div><button type="submit" className="button" disabled={pending}>{w.saveChange}</button></div>
          </form>
        </details>
      )}

      <section aria-labelledby="timeline-title" className="stack">
        <h2 id="timeline-title" className="section-title">{t.incident.timeline}</h2>
        <TimelineView updates={updates} t={t} />
      </section>

      {!incident.removed && <RemoveIncident id={incident.id} t={t} />}

      <dialog ref={dialog} className="dialog" aria-labelledby="end-title">
        {ending && (
          <form className="stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => postMaintenanceUpdate(incident.id, { status: ending.status, body: ending.text }), ending.status === "completed" ? w.finished : w.cancelled); if (r.ok) dialog.current?.close(); }}>
            <h2 id="end-title">{ending.status === "completed" ? w.finish : w.cancelIt}</h2>
            <div>
              <label className="label" htmlFor="end-text">{t.incident.resolveText}</label>
              <textarea id="end-text" className="field" rows={3} maxLength={5000} required value={ending.text} onChange={e => setEnding({ ...ending, text: e.target.value })} />
            </div>
            <div className="actions end">
              <button type="button" className="button link" onClick={() => dialog.current?.close()}>{t.incident.cancelEdit}</button>
              <button type="submit" className="button" disabled={pending}>{ending.status === "completed" ? w.finish : w.cancelIt}</button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}
