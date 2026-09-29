"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Alert } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { DocumentType, NumberFormat } from "../../../lib/model.ts";
import { continueSequence, setNumberFormat } from "../actions.ts";

type SequenceView = { type: DocumentType; next: string; nextSeq: number; started: boolean; prefix: string };

// The numbering: with or without the year, the next number of each kind —
// which an administrator may move forward once, to go on from the previous
// tool's last number — and every change made, kept.
export function NumberingPanel({ t, canEdit, format: current, examples, sequences, history }: { t: Catalogue; canEdit: boolean; format: NumberFormat; examples: Record<NumberFormat, string>; sequences: SequenceView[]; history: { id: string; text: string; when: string }[] }) {
  const n = t.settings.numbering;
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<SequenceView | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typed = /^\d{1,8}$/u.test(value.trim()) ? Number(value.trim()) : null;
  const preview = editing && typed ? editing.prefix + String(typed).padStart(4, "0") : null;

  async function choose(next: NumberFormat) {
    if (next === current) return;
    const result = await setNumberFormat(next);
    if (!result.ok) return toast(t.errors[result.error]);
    toast(format(n.formatSaved, { example: examples[next] }));
    router.refresh();
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    const result = await continueSequence(editing.type, value);
    setBusy(false);
    if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
    setEditing(null);
    toast(format(n.saved, { number: result.value.next }));
    router.refresh();
  }

  return (
    <section className="panel" aria-labelledby="s-numbering">
      <h2 id="s-numbering">{t.settings.sections.numbering}</h2>
      <p className="hint">{t.settings.sections.numberingHint}</p>
      <fieldset className="choice" disabled={!canEdit}>
        <legend>{n.format}</legend>
        <div className="two-col">
          <label className="option"><input type="radio" name="number-format" checked={current === "yearly"} onChange={() => void choose("yearly")} /><span>{n.yearly}</span><span className="sub">{format(n.yearlyHint, { example: examples.yearly })}</span></label>
          <label className="option"><input type="radio" name="number-format" checked={current === "continuous"} onChange={() => void choose("continuous")} /><span>{n.continuous}</span><span className="sub">{format(n.continuousHint, { example: examples.continuous })}</span></label>
        </div>
        <p className="hint">{n.formatWarning}</p>
      </fieldset>
      <dl className="sequences">
        {sequences.map(s => (
          <div key={s.type} className="sequence">
            <dt>{n.kinds[s.type]}</dt>
            <dd>
              <span className="num strong">{s.next}</span>
              <span className="hint">{s.started ? n.started : n.next}</span>
              {canEdit && !s.started && <button type="button" className="link-button" onClick={() => { setEditing(s); setValue(String(s.nextSeq)); setError(null); }}>{n.continue}</button>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="hint">{n.never}</p>
      {history.length > 0 && (
        <details className="history">
          <summary>{n.history}</summary>
          <ol className="timeline">{history.map(h => <li key={h.id}><span>{h.text}<br /><span className="when">{h.when}</span></span></li>)}</ol>
        </details>
      )}
      <Dialog open={editing !== null} title={n.continueTitle} closeLabel={t.shell.close} onClose={() => setEditing(null)}>
        {editing && (
          <form className="form-grid" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
            <p>{format(n.continueBody, { kind: n.kinds[editing.type] })}</p>
            <div className="field-row half">
              <label htmlFor="next-seq">{n.continueField}</label>
              <div className="prefixed">
                <span className="prefix num" aria-hidden="true">{editing.prefix}</span>
                <input id="next-seq" className="field num" inputMode="numeric" value={value} maxLength={8} aria-invalid={error ? true : undefined} aria-describedby="next-seq-hint" onChange={e => setValue(e.target.value)} autoFocus />
              </div>
              <span className="hint" id="next-seq-hint">{preview ? format(n.continueExample, { number: preview }) : " "}</span>
            </div>
            <div className="callout quiet" role="note"><Alert /><p>{n.continueWarning}</p></div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button quiet" onClick={() => setEditing(null)}>{t.common.cancel}</button>
              <button type="submit" className="button" disabled={busy || !preview}>{preview ? format(n.confirm, { number: preview }) : n.continue}</button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
