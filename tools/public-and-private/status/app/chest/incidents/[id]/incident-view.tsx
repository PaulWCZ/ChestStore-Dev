"use client";

import { Dialog, useToast } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImpactPicker, type PickerGroup } from "../../../../components/component-picker.tsx";
import { Back, External, Pencil } from "../../../../components/icons.tsx";
import { SecondField, SecondToggle } from "../../../../components/second-field.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Impact } from "../../../../lib/model.ts";
import { postUpdate, removeIncident, renameIncident, restoreIncident, writePostmortem } from "../../actions.ts";
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
  dialog: DialogWords;
};

// The second language of the incident's texts: its code and its name in
// the editor's language ("French").
export type Languages = { second: string; secondName: string };

// A text an editor must fill: the form says so in its own words, next to
// the field, instead of the browser's bubble (in the browser's language).
export function Missing({ id, show, t }: { id: string; show: boolean; t: Words }) {
  return show ? <p id={id} className="error" role="alert">{t.errors.required}</p> : null;
}

// The page header of an incident or a maintenance: back, the title (renamed
// in place, with its second version), where it stands, the public page,
// and the banner of a removed one.
export function Head({ id, title, titleSecond, hasSecond, languages, chip, chipClass, publicLink, removed, t }: { id: string; title: string; titleSecond: string | null; hasSecond: boolean; languages: Languages; chip: string; chipClass: string; publicLink: string; removed: string | null; t: Words }) {
  const w = t.incident;
  const { run, pending } = useRun(t.errors);
  const [renaming, setRenaming] = useState(false);
  const [text, setText] = useState(title);
  const [second, setSecond] = useState(titleSecond ?? "");
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
          <form className="rename stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => renameIncident(id, text, hasSecond ? second : undefined), w.renamed); if (r.ok) setRenaming(false); }}>
            <label className="visually-hidden" htmlFor="rename">{w.rename}</label>
            <input id="rename" className="field big" maxLength={160} value={text} onChange={e => setText(e.target.value)} autoFocus />
            {hasSecond && <SecondField id="rename-second" label={format(t.compose.titleIn!, { language: languages.secondName })} value={second} onChange={setSecond} lang={languages.second} multiline={false} max={160} />}
            <div className="actions">
              <button type="submit" className="button small" disabled={pending}>{w.save}</button>
              <button type="button" className="button link" onClick={() => { setRenaming(false); setText(title); setSecond(titleSecond ?? ""); }}>{w.cancelEdit}</button>
            </div>
          </form>
        ) : (
          <h1>
            {title}
            {!removed && <button type="button" className="icon-button" aria-label={w.rename} onClick={() => setRenaming(true)}><Pencil /></button>}
          </h1>
        )}
        {!renaming && titleSecond && <p className="muted second-title" lang={languages.second}>{format(w.inLanguage!, { language: languages.secondName })} · {titleSecond}</p>}
        <div className="head-meta">
          <span className={`chip ${chipClass}`}>{chip}</span>
          {!removed && <a href={publicLink} target="_blank" rel="noopener">{w.viewPublic}<External /></a>}
        </div>
      </div>
    </>
  );
}

// Removing the whole incident from the page: no question asked, an Undo
// instead (the kit's toast: it says whether the Undo worked).
export function RemoveIncident({ id, t }: { id: string; t: Words }) {
  const w = t.incident;
  const toast = useToast();
  const { run, pending, undo } = useRun(t.errors);
  return (
    <p className="danger-zone">
      <button type="button" className="button link danger" disabled={pending} onClick={() => run(() => removeIncident(id), () => toast({ id: `remove-${id}`, text: w.removedIncident!, undo: undo(() => restoreIncident(id)) }))}>{w.removeIncident}</button>
    </p>
  );
}

function Steps({ name, value, onChange, t }: { name: string; value: string; onChange: (value: string) => void; t: Words }) {
  return (
    <fieldset className="steps-pick compact">
      <legend className="label">{t.incident.updateStatus}</legend>
      {["investigating", "identified", "monitoring"].map(s => (
        <label key={s} className={`step-option${value === s ? " on" : ""}`}>
          <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} />
          <span><strong>{t.steps[s]}</strong><span className="muted">{t.stepHelp[s]}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

// After "Resolved": the post-mortem, published (or corrected) under the
// timeline of the incident's public page.
function PostmortemForm({ id, current, hasSecond, languages, t }: { id: string; current: { body: string; bodySecond: string | null } | null; hasSecond: boolean; languages: Languages; t: Words }) {
  const w = t.incident;
  const { run, pending } = useRun(t.errors);
  const [body, setBody] = useState(current?.body ?? "");
  const [withSecond, setWithSecond] = useState(hasSecond || Boolean(current?.bodySecond));
  const [second, setSecond] = useState(current?.bodySecond ?? "");
  const [missing, setMissing] = useState(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setMissing(true);
      document.getElementById("postmortem-body")?.focus();
      return;
    }
    setMissing(false);
    await run(() => writePostmortem(id, { body, ...(withSecond ? { bodySecond: second } : {}) }), w.postmortemSaved);
  };
  return (
    <section id="postmortem" className="card pad stack" aria-labelledby="postmortem-title">
      <h2 id="postmortem-title">{w.postmortem}</h2>
      <p className="hint" id="postmortem-hint">{w.postmortemHint}</p>
      <form className="stack" noValidate onSubmit={save}>
        <div>
          <label className="visually-hidden" htmlFor="postmortem-body">{w.postmortem}</label>
          <textarea id="postmortem-body" className="field" rows={5} maxLength={5000} placeholder={w.postmortemPlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-describedby={missing ? "postmortem-missing" : "postmortem-hint"} aria-invalid={missing || undefined} />
          <Missing id="postmortem-missing" show={missing} t={t} />
        </div>
        <SecondToggle checked={withSecond} onChange={setWithSecond} label={format(t.compose.alsoIn!, { language: languages.secondName })} />
        {withSecond && <SecondField id="postmortem-second" label={format(t.compose.bodyIn!, { language: languages.secondName })} value={second} onChange={setSecond} lang={languages.second} rows={5} />}
        <div><button type="submit" className="button" disabled={pending}>{current ? w.postmortemSave : w.postmortemPublish}</button></div>
      </form>
    </section>
  );
}

export function IncidentView({ incident, current, groups, updates, publicLink, languages, t }: {
  incident: { id: string; title: string; titleSecond: string | null; status: string; backfilled: boolean; removed: string | null; affected: string[]; hasSecond: boolean; postmortem: { body: string; bodySecond: string | null } | null };
  current: Record<string, Impact>;
  groups: PickerGroup[];
  updates: UpdateView[];
  publicLink: string;
  languages: Languages;
  t: Words;
}) {
  const w = t.incident;
  const router = useRouter();
  const { run, pending } = useRun(t.errors);
  const resolved = incident.status === "resolved";
  const [status, setStatus] = useState(resolved ? "investigating" : incident.status);
  const [body, setBody] = useState("");
  const [withSecond, setWithSecond] = useState(incident.hasSecond);
  const [second, setSecond] = useState("");
  const [states, setStates] = useState<Record<string, Impact>>(current);
  const [changing, setChanging] = useState(false);
  const [closing, setClosing] = useState(t.compose.resolutionDefault ?? "");
  const [closingSecond, setClosingSecond] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const [asking, setAsking] = useState<"resolve" | "reopen" | null>(null);
  const closingDefault = t.compose.resolutionDefault ?? "";
  const affectedNow = Object.keys(current).map(id => groups.flatMap(g => g.items).find(c => c.id === id)?.name ?? "").filter(Boolean);
  const secondWords = { alsoIn: format(t.compose.alsoIn!, { language: languages.secondName }), bodyIn: format(t.compose.bodyIn!, { language: languages.secondName }) };

  // Checks a required text; says so next to it and puts the cursor there.
  const need = (value: string, id: string) => {
    if (value.trim()) return true;
    setMissing(id);
    document.getElementById(id)?.focus();
    return false;
  };
  const post = async (event: React.FormEvent, reopen = false) => {
    event.preventDefault();
    if (!need(body, reopen ? "reopen-body" : "update-body")) return;
    setMissing(null);
    const r = await run(() => postUpdate(incident.id, { status, body, ...(withSecond && second.trim() ? { bodySecond: second } : {}), ...(changing ? { states } : {}), ...(reopen ? { reopen: true } : {}) }), reopen ? w.reopened : w.updated);
    if (r.ok) {
      setBody("");
      setSecond("");
      setChanging(false);
      if (reopen) setAsking(null);
    }
  };
  const resolve = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!need(closing, "closing")) return;
    setMissing(null);
    const r = await run(() => postUpdate(incident.id, { status: "resolved", body: closing, ...(withSecond && closingSecond.trim() ? { bodySecond: closingSecond } : {}) }), w.resolved);
    if (r.ok) {
      setAsking(null);
      router.refresh();
    }
  };
  const fields = (prefix: string) => (
    <>
      <Steps name={`${prefix}-status`} value={status} onChange={setStatus} t={t} />
      <div>
        <label className="label" htmlFor={`${prefix}-body`}>{w.updateBody}</label>
        <textarea id={`${prefix}-body`} className="field" rows={4} maxLength={5000} placeholder={w.updatePlaceholder} value={body} onChange={e => setBody(e.target.value)} aria-invalid={missing === `${prefix}-body` || undefined} aria-describedby={missing === `${prefix}-body` ? `${prefix}-missing` : undefined} />
        <Missing id={`${prefix}-missing`} show={missing === `${prefix}-body`} t={t} />
      </div>
      <SecondToggle checked={withSecond} onChange={setWithSecond} label={secondWords.alsoIn} />
      {withSecond && <SecondField id={`${prefix}-second`} label={secondWords.bodyIn} value={second} onChange={setSecond} lang={languages.second} rows={4} />}
      <label className="check toggle">
        <input type="checkbox" checked={changing} onChange={e => setChanging(e.target.checked)} />
        <span>{w.changeComponents}</span>
      </label>
      {changing && <ImpactPicker groups={groups} value={states} onChange={setStates} t={{ impact: t.compose.impact!, states: t.states, legend: t.compose.components! }} />}
    </>
  );

  return (
    <div className="narrow stack-l">
      <Head id={incident.id} title={incident.title} titleSecond={incident.titleSecond} hasSecond={incident.hasSecond} languages={languages} chip={t.steps[incident.status] ?? ""} chipClass={`step-${incident.status}`} publicLink={publicLink} removed={incident.removed} t={t} />
      {incident.affected.length > 0 && <p className="muted">{w.affects} · {incident.affected.join(", ")}{incident.backfilled ? ` · ${w.backfilled}` : ""}</p>}

      {!incident.removed && !resolved && (
        <section id="update" className="card pad stack" aria-labelledby="update-title">
          <div className="section-head">
            <h2 id="update-title">{w.update}</h2>
            <button type="button" className="button resolve" onClick={() => setAsking("resolve")}>{w.resolve}</button>
          </div>
          <form className="stack" noValidate onSubmit={e => post(e)}>
            {fields("update")}
            <div><button type="submit" className="button" disabled={pending}>{w.submitUpdate}</button></div>
          </form>
        </section>
      )}

      {!incident.removed && resolved && (
        <>
          <div className="resolved-line">
            <p>{w.resolvedNote}</p>
            <button type="button" className="button quiet" onClick={() => setAsking("reopen")}>{w.reopen}</button>
          </div>
          <PostmortemForm id={incident.id} current={incident.postmortem} hasSecond={incident.hasSecond} languages={languages} t={t} />
        </>
      )}

      <section aria-labelledby="timeline-title" className="stack">
        <h2 id="timeline-title" className="section-title">{w.timeline}</h2>
        <TimelineView updates={updates} languages={languages} t={t} />
      </section>

      {!incident.removed && <RemoveIncident id={incident.id} t={t} />}

      <Dialog
        open={asking === "resolve"}
        title={w.resolveTitle}
        onClose={() => { setAsking(null); setClosing(closingDefault); setClosingSecond(""); setMissing(null); }}
        dirty={closing !== closingDefault || closingSecond !== ""}
        labels={t.dialog}
        footer={<>
          <button type="button" className="button link" onClick={() => { setAsking(null); setClosing(closingDefault); setClosingSecond(""); }}>{w.cancelEdit}</button>
          <button type="submit" form="resolve-form" className="button resolve" disabled={pending}>{w.resolveConfirm}</button>
        </>}
      >
        <form id="resolve-form" className="stack" noValidate onSubmit={resolve}>
          <p>{affectedNow.length ? format(w.resolveBody!, { list: affectedNow.join(", ") }) : w.resolveNone}</p>
          <div>
            <label className="label" htmlFor="closing">{w.resolveText}</label>
            <textarea id="closing" className="field" rows={3} maxLength={5000} value={closing} onChange={e => setClosing(e.target.value)} aria-invalid={missing === "closing" || undefined} aria-describedby={missing === "closing" ? "closing-missing" : undefined} />
            <Missing id="closing-missing" show={missing === "closing"} t={t} />
          </div>
          {withSecond && <SecondField id="closing-second" label={secondWords.bodyIn} value={closingSecond} onChange={setClosingSecond} lang={languages.second} />}
        </form>
      </Dialog>

      <Dialog
        open={asking === "reopen"}
        title={w.reopenTitle}
        description={w.reopenBody}
        onClose={() => { setAsking(null); setBody(""); setSecond(""); setMissing(null); }}
        dirty={body.trim() !== "" || second.trim() !== ""}
        labels={t.dialog}
        footer={<>
          <button type="button" className="button link" onClick={() => { setAsking(null); setBody(""); setSecond(""); }}>{w.cancelEdit}</button>
          <button type="submit" form="reopen-form" className="button" disabled={pending}>{w.reopenConfirm}</button>
        </>}
      >
        <form id="reopen-form" className="stack" noValidate onSubmit={e => post(e, true)}>
          {fields("reopen")}
        </form>
      </Dialog>
    </div>
  );
}
