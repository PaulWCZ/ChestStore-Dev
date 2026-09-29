"use client";

import { Dialog } from "@argentic/chest-ui/components";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import type { PickerGroup } from "../../../../components/component-picker.tsx";
import { useDateProblems } from "../../../../components/date-problems.tsx";
import { SecondField, SecondToggle } from "../../../../components/second-field.tsx";
import { useRun } from "../../../../components/use-run.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { changeMaintenance, postMaintenanceUpdate } from "../../actions.ts";
import { MaintenanceFields, type WindowValue } from "../../maintenance/maintenance-fields.tsx";
import { Head, Missing, RemoveIncident, type Languages, type Words } from "./incident-view.tsx";
import { TimelineView, type UpdateView } from "./timeline-view.tsx";

// A maintenance for editors: its window (planned, in progress, completed —
// read from the clock), news to post during it, finish early or cancel,
// and the window to change while it has not ended.
export function MaintenanceView({ incident, form, updates, publicLink, languages, t }: {
  incident: { id: string; title: string; titleSecond: string | null; phase: string; window: string; affected: string[]; autoPosts: boolean; removed: string | null; hasSecond: boolean };
  form: { start: { day: string; minutes: number }; end: { day: string; minutes: number }; components: string[]; groups: PickerGroup[]; zoneNote: string; today: string };
  updates: UpdateView[];
  publicLink: string;
  languages: Languages;
  t: Words & { date: DateWords };
}) {
  const w = t.maintenance;
  const [withSecond, setWithSecond] = useState(incident.hasSecond);
  const [second, setSecond] = useState("");
  const [endSecond, setEndSecond] = useState("");
  const [missing, setMissing] = useState(false);
  const bodyIn = format(t.compose.bodyIn!, { language: languages.secondName });
  const { run, pending } = useRun(t.errors);
  const open = incident.phase === "scheduled" || incident.phase === "in_progress";
  const [body, setBody] = useState("");
  const [ending, setEnding] = useState<{ status: "completed" | "cancelled"; text: string } | null>(null);
  const [value, setValue] = useState<WindowValue>({ title: incident.title, start: form.start, end: form.end, components: form.components, autoPosts: incident.autoPosts });
  // A day the kit refused leaves the previous one in `value`: the change
  // waits, on the field and its sentence.
  const dates = useDateProblems();
  const phaseWord: Record<string, string> = { scheduled: w.phaseScheduled!, in_progress: w.phaseInProgress!, completed: w.phaseCompleted!, cancelled: w.phaseCancelled! };

  const ask = (status: "completed" | "cancelled") => {
    setEnding({ status, text: status === "completed" ? w.finishText! : w.cancelText! });
  };

  return (
    <div className="narrow stack-l">
      <Head id={incident.id} title={incident.title} titleSecond={incident.titleSecond} hasSecond={incident.hasSecond} languages={languages} chip={phaseWord[incident.phase] ?? ""} chipClass={`step-${incident.phase}`} publicLink={publicLink} removed={incident.removed} t={t} />
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
          <form className="stack" noValidate onSubmit={async e => {
            e.preventDefault();
            if (!body.trim()) { setMissing(true); document.getElementById("m-body")?.focus(); return; }
            setMissing(false);
            const r = await run(() => postMaintenanceUpdate(incident.id, { status: "update", body, ...(withSecond && second.trim() ? { bodySecond: second } : {}) }), t.incident.updated);
            if (r.ok) { setBody(""); setSecond(""); }
          }}>
            <label className="visually-hidden" htmlFor="m-body">{w.post}</label>
            <textarea id="m-body" className="field" rows={3} maxLength={5000} placeholder={w.bodyPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-invalid={missing || undefined} aria-describedby={missing ? "m-body-missing" : undefined} />
            <Missing id="m-body-missing" show={missing} t={t} />
            <SecondToggle checked={withSecond} onChange={setWithSecond} label={format(t.compose.alsoIn!, { language: languages.secondName })} />
            {withSecond && <SecondField id="m-body-second" label={bodyIn} value={second} onChange={setSecond} lang={languages.second} />}
            <div><button type="submit" className="button" disabled={pending}>{t.incident.submitUpdate}</button></div>
          </form>
        </section>
      )}

      {open && !incident.removed && (
        <details className="card pad">
          <summary className="summary-button">{w.change}</summary>
          <form className="stack form" onSubmit={e => {
            e.preventDefault();
            const refused = dates.of("m-start-day") ? "m-start-day" : dates.of("m-end-day") ? "m-end-day" : null;
            if (refused) { document.getElementById(refused)?.focus(); return; }
            void run(() => changeMaintenance(incident.id, value), w.changed);
          }}>
            <MaintenanceFields value={value} onChange={setValue} groups={form.groups} zoneNote={form.zoneNote} today={form.today} watch={dates.watch} t={t} />
            <div><button type="submit" className="button" disabled={pending}>{w.saveChange}</button></div>
          </form>
        </details>
      )}

      <section aria-labelledby="timeline-title" className="stack">
        <h2 id="timeline-title" className="section-title">{t.incident.timeline}</h2>
        <TimelineView updates={updates} languages={languages} t={t} />
      </section>

      {!incident.removed && <RemoveIncident id={incident.id} t={t} />}

      <Dialog
        open={ending !== null}
        title={ending?.status === "completed" ? w.finish : w.cancelIt}
        onClose={() => { setEnding(null); setEndSecond(""); }}
        dirty={ending !== null && (ending.text !== (ending.status === "completed" ? w.finishText : w.cancelText) || endSecond !== "")}
        labels={t.dialog}
        footer={<>
          <button type="button" className="button link" onClick={() => { setEnding(null); setEndSecond(""); }}>{t.incident.cancelEdit}</button>
          <button type="submit" form="end-form" className={ending?.status === "completed" ? "button resolve" : "button"} disabled={pending}>{ending?.status === "completed" ? w.finish : w.cancelIt}</button>
        </>}
      >
        {ending && (
          <form id="end-form" className="stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => postMaintenanceUpdate(incident.id, { status: ending.status, body: ending.text, ...(withSecond && endSecond.trim() ? { bodySecond: endSecond } : {}) }), ending.status === "completed" ? w.finished : w.cancelled); if (r.ok) { setEnding(null); setEndSecond(""); } }}>
            <div>
              <label className="label" htmlFor="end-text">{t.incident.resolveText}</label>
              <textarea id="end-text" className="field" rows={3} maxLength={5000} required value={ending.text} onChange={e => setEnding({ ...ending, text: e.target.value })} />
            </div>
            {withSecond && <SecondField id="end-second" label={bodyIn} value={endSecond} onChange={setEndSecond} lang={languages.second} />}
          </form>
        )}
      </Dialog>
    </div>
  );
}
