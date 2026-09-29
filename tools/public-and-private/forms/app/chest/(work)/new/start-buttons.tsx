"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { createForm } from "../../actions.ts";

// Buttons that start a form from a template, one click each.
export function StartButtons({ keys, words, errors }: { keys: string[]; words: Record<string, string>; errors: Catalogue["errors"] }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const toast = useToast();
  return (
    <div className="start-buttons">
      {keys.map(k => (
        <button key={k} type="button" className="chip" disabled={pending} aria-busy={pending && which === k} onClick={() => {
          setWhich(k);
          start(async () => {
            const r = await createForm(k);
            if (r && !r.ok) toast({ text: errors[r.error] ?? errors.unknown, tone: "error" });
          });
        }}>{words[k]}</button>
      ))}
    </div>
  );
}
