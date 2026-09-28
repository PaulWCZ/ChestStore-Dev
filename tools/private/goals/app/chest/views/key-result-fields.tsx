"use client";

import { useId } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";

export type KrDraft = { title: string; kind: "number" | "percent" | "money" | "milestone"; start: string; target: string; unit: string; owner: string; weight: string };
export type FieldWords = { form: Catalogue["form"]; kinds: Catalogue["kinds"]; kindHints: Catalogue["kindHints"] };

export const emptyDraft = (owner: string): KrDraft => ({ title: "", kind: "number", start: "0", target: "", unit: "", owner, weight: "1" });

// The fields of one key result: what it is, how it is measured (from…
// to…, in what), who owns it and how much it counts.
export function KeyResultFields({ draft, onChange, owners, t, autoFocus = false }: { draft: KrDraft; onChange: (d: KrDraft) => void; owners: { id: string; name: string }[]; t: FieldWords; autoFocus?: boolean }) {
  const uid = useId();
  const set = (patch: Partial<KrDraft>) => onChange({ ...draft, ...patch });
  const f = t.form;
  return (
    <>
      <div>
        <label className="label" htmlFor={`${uid}-title`}>{f.krTitle}</label>
        <input id={`${uid}-title`} className="field" maxLength={200} value={draft.title} placeholder={f.krTitlePlaceholder} autoFocus={autoFocus} onChange={e => set({ title: e.target.value })} />
      </div>
      <div className="grid-2">
        <div>
          <label className="label" htmlFor={`${uid}-kind`}>{f.kind}</label>
          <select id={`${uid}-kind`} className="select" value={draft.kind} onChange={e => set({ kind: e.target.value as KrDraft["kind"], ...(e.target.value === "percent" && draft.target === "" ? { start: "0", target: "100" } : {}) })} aria-describedby={`${uid}-kind-hint`}>
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
        <div className="measure">
          <div>
            <label className="label" htmlFor={`${uid}-start`}>{f.start}</label>
            <input id={`${uid}-start`} className="field" inputMode="decimal" autoComplete="off" value={draft.start} onChange={e => set({ start: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-target`}>{f.target}</label>
            <input id={`${uid}-target`} className="field" inputMode="decimal" autoComplete="off" value={draft.target} onChange={e => set({ target: e.target.value })} />
          </div>
          {draft.kind === "number" && (
            <div className="unit">
              <label className="label" htmlFor={`${uid}-unit`}>{f.unit}</label>
              <input id={`${uid}-unit`} className="field" maxLength={20} value={draft.unit} placeholder={f.unitPlaceholder} onChange={e => set({ unit: e.target.value })} />
            </div>
          )}
        </div>
      )}
      <div>
        <label className="label" htmlFor={`${uid}-weight`}>{f.weight}</label>
        <select id={`${uid}-weight`} className="select weight" value={draft.weight} onChange={e => set({ weight: e.target.value })}>
          {(["1", "2", "3"] as const).map(w => <option key={w} value={w}>{f.weights[w]}</option>)}
        </select>
      </div>
    </>
  );
}

// What a server action receives for a draft.
export function krInput(d: KrDraft) {
  return { title: d.title, kind: d.kind, start: d.start, target: d.target, unit: d.unit, owner: d.owner, weight: Number(d.weight) };
}
