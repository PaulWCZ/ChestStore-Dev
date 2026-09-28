"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImpactPicker, type PickerGroup } from "../../../../components/component-picker.tsx";
import { Back, External, Pencil } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Impact } from "../../../../lib/model.ts";
import { postUpdate, removeIncident, renameIncident, restoreIncident } from "../../actions.ts";
import { TimelineView, type UpdateView } from "./timeline-view.tsx";

export type { UpdateView } from "./timeline-view.tsx";

export type Words = {
  incident: Record<string, string>;
  compose: Record<string, string>;
  steps: Record<string, string>;
  stepHelp: Record<string, string>;
  states: Record<string, string>;
  errors: Record<ErrorCode, string>;
  maintenance: Record<string, string>;
  people: Record<string, string>;
};

// The page header of an incident or a maintenance: back, the title (renamed
// in place), where it stands, the public page, and the banner of a removed one.
export function Head({ id, title, chip, chipClass, publicLink, removed, t }: { id: string; title: string; chip: string; chipClass: string; publicLink: string; removed: string | null; t: Words }) {
  const w = t.incident;
  const { run, pending } = useRun(t.errors);
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState(title);
  return (
    <>
      <p className="crumb"><a href="/chest"><Back />{w.back}</a></p>
      {removed && (
        <div className="removed-banner" role="status">
          <span>{removed}</span>
          <button type="button" className="button small quiet" disabled={pending} onClick={() => run(() => restoreIncident(id), w.restored)}>{w.restore}</button>
        </div>
      )}
      <div className="incident-page-head">
        {renaming ? (
          <form className="rename" onSubmit={async e => { e.preventDefault(); const r = await run(() => renameIncident(id, text), w.renamed); if (r.ok) setRenaming(false); }}>
            <label className="visually-hidden" htmlFor="rename">{w.rename}</label>
            <input id="rename" className="field big" maxLength={160} value={text} onChange={e => setText(e.target.value)} autoFocus />
            <button type="submit" className="button small" disabled={pending}>{w.save}</button>
            <button type="button" className="button link" onClick={() => { setRenaming(false); setText(title); }}>{w.cancelEdit}</button>
          </form>
        ) : (
          <h1>
            {title}
            {!removed && <button type="button" className="icon-button" aria-label={w.rename} onClick={() => setRenaming(true)}><Pencil /></button>}
          </h1>
        )}
        <div className="head-meta">
          <span className={`chip ${chipClass}`}>{chip}</span>
          {!removed && <a href={publicLink} target="_blank" rel="noopener">{w.viewPublic}<External /></a>}
        </div>
      </div>
    </>
  );
}

// Removing the whole incident: no question asked, an Undo instead.
export function RemoveIncident({ id, t }: { id: string; t: Words }) {
  const w = t.incident;
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  return (
    <p className="danger-zone">
      <button type="button" className="button link danger" disabled={pending} onClick={() => run(() => removeIncident(id), () => toast(w.removedIncident!, { label: w.undo!, run: () => void run(() => restoreIncident(id), w.restored) }))}>{w.removeIncident}</button>
    </p>
  );
}

export function IncidentView({ incident, current, groups, updates, publicLink, t }: {
  incident: { id: string; title: string; status: string; backfilled: boolean; removed: string | null; affected: string[] };
  current: Record<string, Impact>;
  groups: PickerGroup[];
  updates: UpdateView[];
  publicLink: string;
  t: Words;
}) {
  const w = t.incident;
  const router = useRouter();
  const { run, pending } = useRun(t.errors);
  const resolved = incident.status === "resolved";
  const [status, setStatus] = useState(resolved ? "monitoring" : incident.status);
  const [body, setBody] = useState("");
  const [states, setStates] = useState<Record<string, Impact>>(current);
  const [changing, setChanging] = useState(false);
  const [closing, setClosing] = useState(t.compose.resolutionDefault ?? "");
  const dialog = useRef<HTMLDialogElement>(null);
  const affectedNow = Object.keys(current).map(id => groups.flatMap(g => g.items).find(c => c.id === id)?.name ?? "").filter(Boolean);

  const post = async (event: React.FormEvent) => {
    event.preventDefault();
    const r = await run(() => postUpdate(incident.id, { status, body, ...(changing ? { states } : {}) }), w.updated);
    if (r.ok) {
      setBody("");
      setChanging(false);
    }
  };
  const resolve = async (event: React.FormEvent) => {
    event.preventDefault();
    const r = await run(() => postUpdate(incident.id, { status: "resolved", body: closing }), w.resolved);
    if (r.ok) {
      dialog.current?.close();
      router.refresh();
    }
  };

  return (
    <main className="narrow stack-l">
      <Head id={incident.id} title={incident.title} chip={t.steps[incident.status] ?? ""} chipClass={`step-${incident.status}`} publicLink={publicLink} removed={incident.removed} t={t} />
      {incident.affected.length > 0 && <p className="muted">{w.affects} · {incident.affected.join(", ")}{incident.backfilled ? ` · ${w.backfilled}` : ""}</p>}

      {!incident.removed && (
        <section id="update" className="card pad stack" aria-labelledby="update-title">
          <div className="section-head">
            <h2 id="update-title">{w.update}</h2>
            {!resolved && <button type="button" className="button resolve" onClick={() => dialog.current?.showModal()}>{w.resolve}</button>}
          </div>
          <form className="stack" onSubmit={post}>
            <fieldset className="steps-pick compact">
              <legend className="label">{w.updateStatus}</legend>
              {["investigating", "identified", "monitoring"].map(s => (
                <label key={s} className={`step-option${status === s ? " on" : ""}`}>
                  <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                  <span><strong>{t.steps[s]}</strong><span className="muted">{t.stepHelp[s]}</span></span>
                </label>
              ))}
            </fieldset>
            {resolved && <p className="hint">{w.reopen}</p>}
            <div>
              <label className="label" htmlFor="update-body">{w.updateBody}</label>
              <textarea id="update-body" className="field" required rows={4} maxLength={5000} placeholder={w.updatePlaceholder} value={body} onChange={e => setBody(e.target.value)} />
            </div>
            <label className="check toggle">
              <input type="checkbox" checked={changing} onChange={e => setChanging(e.target.checked)} />
              <span>{w.changeComponents}</span>
            </label>
            {changing && <ImpactPicker groups={groups} value={states} onChange={setStates} t={{ impact: t.compose.impact!, states: t.states, legend: t.compose.components! }} />}
            <div><button type="submit" className="button" disabled={pending}>{w.submitUpdate}</button></div>
          </form>
        </section>
      )}

      <section aria-labelledby="timeline-title" className="stack">
        <h2 id="timeline-title" className="section-title">{w.timeline}</h2>
        <TimelineView updates={updates} t={t} />
      </section>

      {!incident.removed && <RemoveIncident id={incident.id} t={t} />}

      <dialog ref={dialog} className="dialog" aria-labelledby="resolve-title">
        <form className="stack" onSubmit={resolve}>
          <h2 id="resolve-title">{w.resolveTitle}</h2>
          <p>{affectedNow.length ? format(w.resolveBody!, { list: affectedNow.join(", ") }) : w.resolveNone}</p>
          <div>
            <label className="label" htmlFor="closing">{w.resolveText}</label>
            <textarea id="closing" className="field" rows={3} maxLength={5000} required value={closing} onChange={e => setClosing(e.target.value)} />
          </div>
          <div className="actions end">
            <button type="button" className="button link" onClick={() => dialog.current?.close()}>{w.cancelEdit}</button>
            <button type="submit" className="button resolve" disabled={pending}>{w.resolveConfirm}</button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
