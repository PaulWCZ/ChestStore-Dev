"use client";

import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Down, Plus, Trash, Up } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { fieldKinds, fieldObjects, type FieldDef, type FieldKind, type FieldObject } from "../../../../lib/custom.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { addField, moveField, removeField, updateField } from "../../actions.ts";

type Answer = { ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> };

// The team's own fields, one list per kind of record. Each field saves
// itself when left (its name, its choices); removing one asks first — its
// values go with it.
export function FieldsEditor({ fields, t }: { fields: Record<FieldObject, FieldDef[]>; t: Catalogue }) {
  const w = t.settings.fields;
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<FieldDef | null>(null);
  const toast = useToast();
  const run = (step: () => Promise<Answer>, done?: string) => start(async () => {
    const r = await step();
    if (!r.ok && r.error) toast(format(t.errors[r.error], r.values));
    else if (done) toast(done);
  });
  return (
    <div className="fields-editor">
      {fieldObjects.map(object => (
        <section key={object} className="panel" aria-labelledby={`fields-${object}`}>
          <h2 id={`fields-${object}`} className="label-mono">{w.objects[object]}</h2>
          {fields[object].length === 0 ? <p className="muted">{w.empty}</p> : (
            <ol className="field-rows">
              {fields[object].map((f, i) => (
                <li key={f.id} className="field-row">
                  <span className="field-block grow">
                    <label className="visually-hidden" htmlFor={`fl-${f.id}`}>{w.label}</label>
                    <input id={`fl-${f.id}`} className="field" defaultValue={f.label} maxLength={60}
                      onBlur={e => { const label = e.currentTarget.value; if (label !== f.label) run(() => updateField(f.id, { label }), t.common.saved); }} />
                  </span>
                  <span className="tag">{w.kinds[f.kind]}</span>
                  <span className="stage-tools">
                    <button type="button" className="icon-button small" disabled={pending || i === 0} title={t.settings.up} onClick={() => run(() => moveField(f.id, "up"))}><Up /><span className="visually-hidden">{t.settings.up}</span></button>
                    <button type="button" className="icon-button small" disabled={pending || i === fields[object].length - 1} title={t.settings.down} onClick={() => run(() => moveField(f.id, "down"))}><Down /><span className="visually-hidden">{t.settings.down}</span></button>
                    <button type="button" className="icon-button small" disabled={pending} title={t.settings.remove} onClick={() => setRemoving(f)}><Trash /><span className="visually-hidden">{t.settings.remove}</span></button>
                  </span>
                  {f.kind === "choice" && (
                    <span className="field-block field-options">
                      <label className="label small-label" htmlFor={`fo-${f.id}`}>{w.options} <span className="hint">{w.optionsHint}</span></label>
                      <textarea id={`fo-${f.id}`} className="field" rows={Math.min(6, Math.max(2, f.options.length))} defaultValue={f.options.join("\n")}
                        onBlur={e => { const options = e.currentTarget.value; if (options !== f.options.join("\n")) run(() => updateField(f.id, { options }), t.common.saved); }} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <AddField object={object} disabled={pending} run={run} t={t} />
        </section>
      ))}
      {removing && (
        <Dialog open title={format(w.removeTitle, { label: removing.label })} closeLabel={t.common.close} onClose={() => setRemoving(null)}>
          <p>{w.removeBody}</p>
          <div className="form-actions">
            <button type="button" className="button danger" disabled={pending} onClick={() => { const f = removing; setRemoving(null); run(() => removeField(f.id), w.removed); }}><Trash />{t.settings.remove}</button>
            <button type="button" className="button quiet" onClick={() => setRemoving(null)}>{t.common.cancel}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AddField({ object, disabled, run, t }: { object: FieldObject; disabled: boolean; run: (step: () => Promise<Answer>, done?: string) => void; t: Catalogue }) {
  const w = t.settings.fields;
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FieldKind>("text");
  const [options, setOptions] = useState("");
  return (
    <form className="add-field" onSubmit={e => {
      e.preventDefault();
      run(async () => {
        const r = await addField({ object, label, kind, options });
        if (r.ok) { setLabel(""); setOptions(""); setKind("text"); }
        return r;
      }, w.added);
    }}>
      <span className="field-block grow">
        <label className="visually-hidden" htmlFor={`new-${object}`}>{w.label}</label>
        <input id={`new-${object}`} className="field" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder={w.addPlaceholder} required />
      </span>
      <span className="field-block">
        <label className="visually-hidden" htmlFor={`kind-${object}`}>{w.kind}</label>
        <select id={`kind-${object}`} className="field" value={kind} onChange={e => setKind(e.target.value as FieldKind)}>
          {fieldKinds.map(k => <option key={k} value={k}>{w.kinds[k]}</option>)}
        </select>
      </span>
      {kind === "choice" && (
        <span className="field-block field-options">
          <label className="label small-label" htmlFor={`opts-${object}`}>{w.options} <span className="hint">{w.optionsHint}</span></label>
          <textarea id={`opts-${object}`} className="field" rows={3} value={options} onChange={e => setOptions(e.target.value)} required />
        </span>
      )}
      <button type="submit" className="button small quiet" disabled={disabled}><Plus />{w.add}</button>
    </form>
  );
}
