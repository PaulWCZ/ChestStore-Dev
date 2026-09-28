"use client";

import { useActionState, useState } from "react";
import { fill } from "../../lib/i18n.ts";
import type { EditorWords, Messages } from "../../lib/i18n.ts";
import { limits } from "../../lib/model.ts";
import type { Kind } from "../../lib/model.ts";
import type { EditorState } from "../actions.ts";
import { number } from "./labels.ts";

type Draft = { title: string; description: string; fields: { label: string; kind: Kind; required: boolean }[] };

// Editor writes a draft: its title, its description and its fields, sent
// as one JSON text that the server checks whole.
export function Editor({ initial, action, submit, words: t, kinds }: { initial: Draft; action: (state: EditorState, data: FormData) => Promise<EditorState>; submit: string; words: EditorWords; kinds: Messages["kinds"] }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [draft, setDraft] = useState<Draft>(initial);
  const setField = (i: number, change: Partial<Draft["fields"][number]>) =>
    setDraft(d => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...change } : f)) }));
  const move = (i: number, by: number) =>
    setDraft(d => {
      const fields = [...d.fields];
      const [field] = fields.splice(i, 1);
      if (field) fields.splice(i + by, 0, field);
      return { ...d, fields };
    });
  return (
    <form action={formAction}>
      <input type="hidden" name="definition" value={JSON.stringify(draft)} />
      {state.error && <p className="notice" role="alert">{t.errors[state.error]}</p>}
      <label className="field">
        <span>{t.title}</span>
        <input type="text" required maxLength={limits.title} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <label className="field">
        <span>{t.description}</span>
        <textarea maxLength={limits.description} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      </label>
      <h2>{t.fields}</h2>
      <p className="small">{fill(t.fieldCount, { count: draft.fields.length, max: limits.fields })}</p>
      <ol className="fields">
        {draft.fields.map((field, i) => (
          <li key={i}>
            <span className="small">{number(i)}</span>
            <div>
              <label className="field tight">
                <span className="small">{t.label}</span>
                <input type="text" required maxLength={limits.label} aria-label={fill(t.labelOf, { n: number(i) })} value={field.label} onChange={e => setField(i, { label: e.target.value })} />
              </label>
              <div className="row">
                <select aria-label={fill(t.kindOf, { n: number(i) })} value={field.kind} onChange={e => setField(i, { kind: e.target.value as Kind })}>
                  {(Object.keys(kinds) as Kind[]).map(kind => <option key={kind} value={kind}>{kinds[kind]}</option>)}
                </select>
                <label className="check"><input type="checkbox" checked={field.required} onChange={e => setField(i, { required: e.target.checked })} /> {t.required}</label>
                <button type="button" className="button quiet" disabled={i === 0} onClick={() => move(i, -1)}>{t.up}</button>
                <button type="button" className="button quiet" disabled={draft.fields.length === 1} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })}>{t.remove}</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="button quiet" disabled={draft.fields.length >= limits.fields} onClick={() => setDraft({ ...draft, fields: [...draft.fields, { label: "", kind: "text", required: false }] })}>{t.add}</button>
        <button type="submit" className="button" disabled={pending}>{submit}</button>
      </div>
    </form>
  );
}
