"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Check } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { saveRetro } from "../../actions.ts";

// The retrospective of an objective, once its cycle ended: a score (the
// key results' progress is suggested) and what the team learned. Read-only
// for everyone but its owner and the admins.
export function Retro({ objectiveId, canWrite, score, learned, suggested, scoreText, by, t }: { objectiveId: string; canWrite: boolean; score: number | null; learned: string; suggested: string; scoreText: string | null; by: string | null; t: { retro: Catalogue["retro"]; errors: Catalogue["errors"] } }) {
  const r = t.retro;
  const [value, setValue] = useState(score === null ? "" : String(Math.round(score * 100)));
  const [text, setText] = useState(learned);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (!canWrite) {
    return (
      <section className="card retro" aria-labelledby="retro">
        <h2 id="retro">{r.title}</h2>
        {scoreText || learned ? (
          <>
            {scoreText && <p><strong>{scoreText}</strong>{by ? ` · ${by}` : ""}</p>}
            {learned && <blockquote>{learned}</blockquote>}
          </>
        ) : <p className="muted">{r.none}</p>}
      </section>
    );
  }
  return (
    <section className="card retro" aria-labelledby="retro">
      <h2 id="retro">{r.title}</h2>
      <p className="muted">{r.body}</p>
      <form className="stack" onSubmit={e => {
        e.preventDefault();
        start(async () => {
          const result = await saveRetro(objectiveId, { score: value === "" ? "" : `${value}%`, learned: text });
          if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
          setError(null);
          toast(r.saved);
          router.refresh();
        });
      }}>
        <div className="score-row">
          <div>
            <label className="label" htmlFor="retro-score">{r.score}</label>
            <input id="retro-score" className="field" inputMode="numeric" value={value} onChange={e => setValue(e.target.value.replace(/[^0-9]/gu, "").slice(0, 3))} aria-describedby="retro-score-hint" />
          </div>
          <p className="hint" id="retro-score-hint">{r.scoreHint} {format(r.suggested, { percent: suggested })}</p>
        </div>
        <div>
          <label className="label" htmlFor="retro-learned">{r.learned}</label>
          <textarea id="retro-learned" className="field" rows={3} maxLength={2000} value={text} placeholder={r.learnedPlaceholder} onChange={e => setText(e.target.value)} />
        </div>
        {error && <p className="error" role="alert"><Alert />{error}</p>}
        <div><button type="submit" className="button" disabled={pending}><Check />{r.save}</button></div>
      </form>
    </section>
  );
}
