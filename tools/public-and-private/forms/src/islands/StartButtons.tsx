import { call } from "@argentic/chest-app/client";
import { useState } from "react";
import type { TemplateKey } from "../lib/templates.ts";

// Buttons that start a form from a template, one click each (the first
// visit's card): the form opens in the builder.
export function StartButtons({ keys, words }: { keys: TemplateKey[]; words: Record<string, string> }) {
  const [which, setWhich] = useState<string | null>(null);
  return (
    <div className="start-buttons">
      {keys.map(k => (
        <button key={k} type="button" className="chip" disabled={which !== null} aria-busy={which === k} onClick={() => {
          setWhich(k);
          void call("createForm", { key: k }).then(() => setWhich(null));
        }}>{words[k]}</button>
      ))}
    </div>
  );
}
