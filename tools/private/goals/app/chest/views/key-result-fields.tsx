"use client";

import { useId } from "react";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { valueText } from "../../../lib/values.ts";

type Source = "manual" | "crm.won_amount" | "crm.won_count";
export type KrDraft = { title: string; kind: "number" | "percent" | "money" | "milestone"; start: string; target: string; unit: string; owner: string; weight: string; source: Source };
export type FieldWords = { form: Catalogue["form"]; kinds: Catalogue["kinds"]; kindHints: Catalogue["kindHints"] };

export const emptyDraft = (owner: string): KrDraft => ({ title: "", kind: "number", start: "0", target: "", unit: "", owner, weight: "1", source: "manual" });

// A number typed in either convention ("12,5" or "12.5"), for the sentence
// under the fields only: the server reads and checks the real value.
const typed = (text: string): number | null => {
  const n = Number(text.replace(/[\s  ]/gu, "").replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) ? null : n;
};

// The fields of one key result: what we count, how (from… to…, in what),
// who owns it; how much it counts and where its value comes from wait
// under "More options". Once the target is typed, a sentence says it back
// ("From 0 to 20 customers") — never before, so no example reads as a value.
export function KeyResultFields({ draft, onChange, owners, t, autoFocus = false, locale = "en", currency = null }: { draft: KrDraft; onChange: (d: KrDraft) => void; owners: { id: string; name: string }[]; t: FieldWords; autoFocus?: boolean; locale?: string; currency?: string | null }) {
  const uid = useId();
  const set = (patch: Partial<KrDraft>) => onChange({ ...draft, ...patch });
  const f = t.form;
  const fed = draft.source !== "manual";
  const start = typed(draft.start) ?? 0, target = typed(draft.target);
  const measured = { kind: draft.kind === "milestone" ? "number" as const : draft.kind, unit: draft.kind === "number" ? draft.unit.trim() : "", currency };
  const summary = draft.kind !== "milestone" && target !== null && target !== start ? format(f.summary, { start: valueText(measured, start, locale), target: valueText(measured, target, locale) }) : null;
  return (
    <>
      <div>
        <label className="label" htmlFor={`${uid}-title`}>{f.krName}</label>
        <input id={`${uid}-title`} className="field" maxLength={200} value={draft.title} placeholder={f.krTitlePlaceholder} autoFocus={autoFocus} onChange={e => set({ title: e.target.value })} />
      </div>
      <div className="grid-2">
        <div>
          <label className="label" htmlFor={`${uid}-kind`}>{f.kind}</label>
          <select id={`${uid}-kind`} className="select" value={draft.kind} disabled={fed} onChange={e => set({ kind: e.target.value as KrDraft["kind"], ...(e.target.value === "percent" && draft.target === "" ? { start: "0", target: "100" } : {}) })} aria-describedby={`${uid}-kind-hint`}>
            {(["number", "percent", "money", "milestone"] as const).map(k => <option key={k} value={k}>{t.kinds[k]}</option>)}
          </select>
          <p id={`${uid}-kind-hint`} className="hint">{t.kindHints[draft.kind]}</p>
        </div>
        {owners.length > 0 && (
          <div>
            <label className="label" htmlFor={`${uid}-owner`}>{f.krOwner}</label>
            <select id={`${uid}-owner`} className="select" value={draft.owner} onChange={e => set({ owner: e.target.value })}>
              {!owners.some(o => o.id === draft.owner) && <option value={draft.owner}>—</option>}
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {draft.kind !== "milestone" && (
        <div className="stack-s">
          <div className="measure">
            <div>
              <label className="label" htmlFor={`${uid}-start`}>{f.start}</label>
              <input id={`${uid}-start`} className="field" inputMode="decimal" autoComplete="off" value={draft.start} onChange={e => set({ start: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor={`${uid}-target`}>{f.target}</label>
              <input id={`${uid}-target`} className="field" inputMode="decimal" autoComplete="off" value={draft.target} onChange={e => set({ target: e.target.value })} aria-describedby={`${uid}-summary`} />
            </div>
            {draft.kind === "number" && (
              <div className="unit">
                <label className="label" htmlFor={`${uid}-unit`}>{f.unit}</label>
                <input id={`${uid}-unit`} className="field" maxLength={41} value={draft.unit} placeholder={f.unitPlaceholder} onChange={e => set({ unit: e.target.value })} aria-describedby={`${uid}-unit-hint`} />
              </div>
            )}
          </div>
          {draft.kind === "number" && <p id={`${uid}-unit-hint`} className="hint">{f.unitHint}</p>}
          <p id={`${uid}-summary`} className="summary-line" aria-live="polite">{summary}</p>
        </div>
      )}
      <details className="more">
        <summary>{f.more}</summary>
        <div className="grid-2">
          <div>
            <label className="label" htmlFor={`${uid}-weight`}>{f.weight}</label>
            <select id={`${uid}-weight`} className="select weight" value={draft.weight} onChange={e => set({ weight: e.target.value })}>
              {(["1", "2", "3"] as const).map(w => <option key={w} value={w}>{f.weights[w]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-source`}>{f.source}</label>
            <select id={`${uid}-source`} className="select" value={draft.source} aria-describedby={`${uid}-source-hint`} onChange={e => {
              const source = e.target.value as Source;
              set({ source, ...(source === "crm.won_amount" ? { kind: "money" as const } : source === "crm.won_count" ? { kind: "number" as const, unit: draft.unit || "" } : {}) });
            }}>
              <option value="manual">{f.sources.manual}</option>
              <option value="crm.won_amount">{f.sources.crm_won_amount}</option>
              <option value="crm.won_count">{f.sources.crm_won_count}</option>
            </select>
            {fed && <p id={`${uid}-source-hint`} className="hint">{f.sourceHint}</p>}
          </div>
        </div>
      </details>
    </>
  );
}

// What a server action receives for a draft.
export function krInput(d: KrDraft) {
  return { title: d.title, kind: d.kind, start: d.start, target: d.target, unit: d.unit, owner: d.owner, weight: Number(d.weight), source: d.source };
}
