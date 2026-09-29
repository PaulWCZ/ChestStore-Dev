"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Pencil, Trash } from "../../../../components/icons.tsx";
import { SecondField } from "../../../../components/second-field.tsx";
import { useRun } from "../../../../components/use-run.ts";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { editUpdate, removeUpdate, restoreUpdate } from "../../actions.ts";

// The timeline as editors see it: each update with who posted it, its
// corrections (the earlier text one click away) and removals. Correct or
// remove an update in place; a removal can be undone.
export type UpdateView = {
  id: string;
  status: string;
  body: string;
  bodySecond: string | null;
  time: string;
  author: string;
  auto: boolean;
  removed: string | null;
  states: { name: string; state: string }[];
  log: { text: string; previous: string | null }[];
};

type Words = { incident: Record<string, string>; compose: Record<string, string>; steps: Record<string, string>; states: Record<string, string>; errors: Record<ErrorCode, string> };
type Languages = { second: string; secondName: string };

function Entry({ u, languages, t }: { u: UpdateView; languages: Languages; t: Words }) {
  const w = t.incident;
  const toast = useToast();
  const { run, pending, undo } = useRun(t.errors);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(u.body);
  const [second, setSecond] = useState(u.bodySecond ?? "");
  const remove = () => run(() => removeUpdate(u.id), () => toast({ id: `remove-${u.id}`, text: w.removedUpdate!, undo: undo(() => restoreUpdate(u.id)) }));
  return (
    <li className={`step step-${u.status}${u.removed ? " removed" : ""}`}>
      <div className="step-head">
        <strong>{t.steps[u.status]}</strong>
        <span className="muted">{u.time}</span>
        <span className="muted">· {u.auto ? u.author : format(w.by!, { name: u.author })}</span>
        {!u.removed && !editing && (
          <span className="step-actions">
            <button type="button" className="icon-button" onClick={() => setEditing(true)} aria-label={w.edit}><Pencil /></button>
            <button type="button" className="icon-button" disabled={pending} onClick={remove} aria-label={w.remove}><Trash /></button>
          </span>
        )}
      </div>
      {editing ? (
        <form className="stack" onSubmit={async e => { e.preventDefault(); const r = await run(() => editUpdate(u.id, text, second !== (u.bodySecond ?? "") ? second : undefined), w.savedUpdate); if (r.ok) setEditing(false); }}>
          <label className="visually-hidden" htmlFor={`edit-${u.id}`}>{w.edit}</label>
          <textarea id={`edit-${u.id}`} className="field" rows={4} maxLength={5000} value={text} onChange={e => setText(e.target.value)} autoFocus />
          <SecondField id={`edit-second-${u.id}`} label={format(t.compose.bodyIn!, { language: languages.secondName })} value={second} onChange={setSecond} lang={languages.second} />
          <div className="actions">
            <button type="submit" className="button small" disabled={pending}>{w.save}</button>
            <button type="button" className="button link" onClick={() => { setEditing(false); setText(u.body); setSecond(u.bodySecond ?? ""); }}>{t.incident.cancelEdit}</button>
          </div>
        </form>
      ) : (
        <>
          <p className="body">{u.body}</p>
          {u.bodySecond && <p className="body second-body" lang={languages.second}><span className="muted">{format(w.inLanguage!, { language: languages.secondName })} · </span>{u.bodySecond}</p>}
        </>
      )}
      {u.states.length > 0 && (
        <p className="step-states">
          {u.states.map(s => <span key={s.name} className={`state-pill s-${s.state}`}>{s.name} · {t.states[s.state]}</span>)}
        </p>
      )}
      {u.removed && <p className="log">{u.removed}</p>}
      {u.log.length > 0 && (
        <details className="log">
          <summary>{u.log.at(-1)!.text}</summary>
          <ul>
            {u.log.map((l, i) => (
              <li key={i}>{l.text}{l.previous !== null && <><br /><span className="muted">{w.earlier}</span><q>{l.previous}</q></>}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function TimelineView({ updates, languages, t }: { updates: UpdateView[]; languages: Languages; t: Words }) {
  return (
    <ol className="timeline team-timeline">
      {updates.map(u => <Entry key={u.id} u={u} languages={languages} t={t} />)}
    </ol>
  );
}
