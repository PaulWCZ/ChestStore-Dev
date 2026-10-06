"use client";

import type { Impact } from "../lib/model.ts";
import { tone } from "./classes.ts";

// The affected components of an incident, each with its impact: a box to
// tick, then how bad it is. Grouped as the page shows them.
export type PickerGroup = { id: string; name: string | null; items: { id: string; name: string }[] };
type Words = { impact: string; states: Record<string, string>; legend: string };

export function ImpactPicker({ groups, value, onChange, t }: { groups: PickerGroup[]; value: Record<string, Impact>; onChange: (next: Record<string, Impact>) => void; t: Words }) {
  const toggle = (id: string, on: boolean) => {
    const next = { ...value };
    if (on) next[id] = next[id] ?? "partial";
    else delete next[id];
    onChange(next);
  };
  return (
    <fieldset className="picker">
      <legend className="label">{t.legend}</legend>
      {groups.map(g => (
        <div key={g.id} className="picker-group">
          {g.name && <p className="picker-group-name">{g.name}</p>}
          {g.items.map(c => {
            const on = c.id in value;
            return (
              <div key={c.id} className={`picker-row${on ? " on" : ""}`}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={e => toggle(c.id, e.target.checked)} />
                  <span>{c.name}</span>
                </label>
                {on && (
                  <select className={`field impact ${tone(value[c.id]!)}`} aria-label={t.impact.replace("{component}", c.name)} value={value[c.id]} onChange={e => onChange({ ...value, [c.id]: e.target.value as Impact })}>
                    <option value="degraded">{t.states["degraded"]}</option>
                    <option value="partial">{t.states["partial"]}</option>
                    <option value="major">{t.states["major"]}</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}

// Components to tick, without impact (a maintenance takes them down).
export function ComponentChecks({ groups, value, onChange, legend }: { groups: PickerGroup[]; value: string[]; onChange: (next: string[]) => void; legend: string }) {
  return (
    <fieldset className="picker">
      <legend className="label">{legend}</legend>
      {groups.map(g => (
        <div key={g.id} className="picker-group">
          {g.name && <p className="picker-group-name">{g.name}</p>}
          {g.items.map(c => (
            <div key={c.id} className={`picker-row${value.includes(c.id) ? " on" : ""}`}>
              <label className="check">
                <input type="checkbox" checked={value.includes(c.id)} onChange={e => onChange(e.target.checked ? [...value, c.id] : value.filter(v => v !== c.id))} />
                <span>{c.name}</span>
              </label>
            </div>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
