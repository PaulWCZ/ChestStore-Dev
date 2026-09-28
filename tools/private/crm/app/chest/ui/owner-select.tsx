"use client";

import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Teammate } from "./shared.ts";

// Who owns it: someone of the team (a manager or a salesperson), or nobody.
// Someone who may not give things away sees only themselves.
export function OwnerSelect({ id, value, team, me, canAssign, allowNobody = true, onChange, t }: { id: string; value: string | null; team: Teammate[]; me: string; canAssign: boolean; allowNobody?: boolean; onChange: (value: string | null) => void; t: Catalogue }) {
  const people = canAssign ? team : team.filter(p => p.id === me || p.id === value);
  const known = value === null || people.some(p => p.id === value);
  return (
    <select id={id} className="field" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : e.target.value)}>
      {(allowNobody && canAssign) || value === null ? <option value="">{t.common.unassigned}</option> : null}
      {!known && value && <option value={value}>{t.people.unknown}</option>}
      {people.map(p => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (${t.people.you})` : p.name}</option>)}
    </select>
  );
}
