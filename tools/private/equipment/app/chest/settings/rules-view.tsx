"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { limits } from "../../../lib/model.ts";
import { saveCharter } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// The rules for company equipment (optional): shown when someone confirms
// they received something, printed on the handover sheet. Each save is a
// new version; the receipts keep the one accepted.
export function RulesView({ body, t }: { body: string; t: Words }) {
  const [text, setText] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const w = t.settings;
  return (
    <form className="summary-box rules-form" aria-labelledby="rules-title" onSubmit={e => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await saveCharter(text);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(w.rulesSaved);
        router.refresh();
      });
    }}>
      <h2 id="rules-title">{w.rules}</h2>
      <p className="small muted" id="rules-intro">{w.rulesIntro}</p>
      <label className="visually-hidden" htmlFor="rules-body">{w.rules}</label>
      <textarea id="rules-body" className="field" rows={6} value={text} onChange={e => setText(e.target.value)} maxLength={limits.charter} placeholder={w.rulesPlaceholder} aria-describedby="rules-intro" />
      {error && <p className="error" role="alert">{error}</p>}
      <div><button type="submit" className="button" disabled={pending || text.trim() === body.trim()}>{w.rulesSave}</button></div>
    </form>
  );
}
