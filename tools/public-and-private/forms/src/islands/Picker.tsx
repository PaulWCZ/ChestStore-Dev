import { call } from "@argentic/chest-app/client";
import { useState } from "react";
import { KindIcon, Plus } from "../components/icons.tsx";
import type { TemplateKey } from "../lib/templates.ts";
import type { Accent, Kind } from "../shared/model.ts";

export type Choice = { key: TemplateKey; name: string; blurb: string; kinds: Kind[]; count: string; accent: Accent };

// The starting points, as cards: each shows its first questions' kinds.
// A click makes the form and opens it in the builder.
export function Picker({ choices, creating }: { choices: Choice[]; creating: string }) {
  const [which, setWhich] = useState<string | null>(null);
  return (
    <ul className="template-grid">
      {choices.map(c => (
        <li key={c.key}>
          <button type="button" className={`template-card${c.key === "blank" ? " blank" : ""}`} data-accent={c.accent} disabled={which !== null} aria-busy={which === c.key}
            onClick={() => {
              setWhich(c.key);
              void call("createForm", { key: c.key }).then(() => setWhich(null));
            }}>
            <span className="template-art" aria-hidden="true">
              {c.key === "blank" ? <Plus /> : c.kinds.map((k, i) => <span key={i} className="template-line"><KindIcon kind={k} /><span /></span>)}
            </span>
            <span className="template-name">{which === c.key ? creating : c.name}</span>
            <span className="template-blurb">{c.blurb}</span>
            {c.count && <span className="template-count">{c.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
