"use client";

import { useState } from "react";
import { useToast } from "../../../components/toast.tsx";
import { useRun } from "../../../components/use-run.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { saveChecks } from "../actions.ts";

// One line per service: the address to check (empty: not checked), how
// often, the expected answer and when it is too slow. One button saves
// them all, and hands the list to the Chest.
export type CheckRow = { componentId: string; name: string; group: string | null; url: string; every: number; expectStatus: number; maxMs: number; standing: string; tone: string };
type Words = { checks: Record<string, string>; errors: Record<ErrorCode, string> };

export function ChecksForm({ rows, everyChoices, limit, t }: { rows: CheckRow[]; everyChoices: { value: number; label: string }[]; limit: string; t: Words }) {
  const w = t.checks;
  const toast = useToast();
  const { run, pending } = useRun(t.errors);
  const [values, setValues] = useState(rows);
  const set = (i: number, patch: Partial<CheckRow>) => setValues(list => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <form className="stack-l" onSubmit={async e => {
      e.preventDefault();
      await run(() => saveChecks(values.map(r => ({ componentId: r.componentId, url: r.url, every: r.every, expectStatus: r.expectStatus, maxMs: r.maxMs }))), value => toast(value.running ? w.saved! : w.savedOff!));
    }}>
      <ul className="check-list card">
        {values.map((r, i) => (
          <li key={r.componentId} id={`check-${r.componentId}`} className="check-row">
            <div className="check-head">
              <strong>{r.name}</strong>
              {r.group && <span className="muted small">{format(w.group!, { group: r.group })}</span>}
              <span className={`check-standing s-${r.tone}`}>{r.standing}</span>
            </div>
            <div className="check-fields">
              <div className="grow">
                <label className="visually-hidden" htmlFor={`url-${r.componentId}`}>{format(w.address!, { component: r.name })}</label>
                <input id={`url-${r.componentId}`} className="field" type="url" inputMode="url" maxLength={2000} placeholder={w.addressPlaceholder} value={r.url} onChange={e => set(i, { url: e.target.value })} />
              </div>
              {r.url.trim() !== "" && (
                <>
                  <div>
                    <label className="label small-label" htmlFor={`every-${r.componentId}`}>{w.every}</label>
                    <select id={`every-${r.componentId}`} className="field" value={r.every} onChange={e => set(i, { every: Number(e.target.value) })}>
                      {everyChoices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label small-label" htmlFor={`status-${r.componentId}`}>{w.status}</label>
                    <input id={`status-${r.componentId}`} className="field narrow-field" type="number" min={100} max={599} value={r.expectStatus} onChange={e => set(i, { expectStatus: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="label small-label" htmlFor={`ms-${r.componentId}`}>{w.maxMs}</label>
                    <input id={`ms-${r.componentId}`} className="field narrow-field" type="number" min={100} max={30000} step={100} value={r.maxMs} onChange={e => set(i, { maxMs: Number(e.target.value) })} />
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="submit-row">
        <button type="submit" className="button" disabled={pending}>{w.save}</button>
        <p className="hint">{limit}</p>
      </div>
    </form>
  );
}
