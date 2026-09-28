"use client";

import { useState, useTransition } from "react";
import { KindIcon, Plus } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { Accent, Kind } from "../../../../lib/model.ts";
import { createForm } from "../../actions.ts";

export type Choice = { key: string; name: string; blurb: string; kinds: Kind[]; count: string; accent: Accent };

// The starting points, as cards: each shows its first questions' kinds.
export function Picker({ choices, creating, errors }: { choices: Choice[]; creating: string; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const toast = useToast();
  return (
    <ul className="template-grid">
      {choices.map(c => (
        <li key={c.key}>
          <button type="button" className={`template-card${c.key === "blank" ? " blank" : ""}`} data-accent={c.accent} disabled={pending} aria-busy={pending && which === c.key}
            onClick={() => {
              setWhich(c.key);
              start(async () => {
                const r = await createForm(c.key);
                if (r && !r.ok) toast(errors[r.error] ?? errors.unknown);
              });
            }}>
            <span className="template-art" aria-hidden="true">
              {c.key === "blank" ? <Plus /> : c.kinds.map((k, i) => <span key={i} className="template-line"><KindIcon kind={k} /><span /></span>)}
            </span>
            <span className="template-name">{pending && which === c.key ? creating : c.name}</span>
            <span className="template-blurb">{c.blurb}</span>
            {c.count && <span className="template-count">{c.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
