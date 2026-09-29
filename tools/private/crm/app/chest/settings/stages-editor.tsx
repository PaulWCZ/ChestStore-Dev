"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useTransition } from "react";
import { Down, Lost, Plus, Trash, Trophy, Up } from "../../../components/icons.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { addStage, moveStage, removeStage, updateStage } from "../actions.ts";

type Row = { id: string; kind: "open" | "won" | "lost"; name: string; shown: string; standard: string | null; probability: number; deals: number };

// Each stage saves itself when its field is left: rename it, set its
// chance to win, move it, remove it (when it holds no deal).
export function StagesEditor({ stages, locale, t }: { stages: Row[]; locale: Locale; t: Catalogue }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done?: string) => start(async () => {
    const r = await step();
    if (!r.ok && r.error) toast({ text: format(t.errors[r.error], r.values), tone: "error" });
    else if (done) toast(done);
  });
  const open = stages.filter(s => s.kind === "open");
  return (
    <div className="stages-editor">
      <ol className="stage-rows">
        {stages.map(s => {
          const i = open.findIndex(x => x.id === s.id);
          return (
            <li key={s.id} className={`stage-row k-${s.kind}`}>
              <span className="stage-index num" aria-hidden="true">{s.kind === "open" ? String(i + 1).padStart(2, "0") : s.kind === "won" ? <Trophy /> : <Lost />}</span>
              <span className="field-block grow">
                <label className="visually-hidden" htmlFor={`name-${s.id}`}>{t.settings.name}</label>
                <input id={`name-${s.id}`} className="field" defaultValue={s.name || s.standard || ""} placeholder={s.standard ?? ""} maxLength={40}
                  title={s.standard ? t.settings.renameHint : undefined}
                  onBlur={e => { if (e.currentTarget.value !== (s.name || s.standard || "")) run(() => updateStage(s.id, { name: e.currentTarget.value }), t.common.saved); }} />
              </span>
              {s.kind === "open" ? (
                <span className="percent">
                  <label className="visually-hidden" htmlFor={`p-${s.id}`}>{t.settings.probability}</label>
                  <input id={`p-${s.id}`} className="field num" type="number" min={0} max={100} step={5} defaultValue={s.probability}
                    onBlur={e => { if (Number(e.currentTarget.value) !== s.probability) run(() => updateStage(s.id, { probability: e.currentTarget.value }), t.common.saved); }} />
                  <span aria-hidden="true">{t.settings.percent}</span>
                </span>
              ) : <span className="percent num muted">{s.probability}{t.settings.percent}</span>}
              <span className="stage-deals muted num">{plural(t.settings.deals, s.deals, locale)}</span>
              {s.kind === "open" ? (
                <span className="stage-tools">
                  <button type="button" className="icon-button small" disabled={pending || i === 0} title={t.settings.up} onClick={() => run(() => moveStage(s.id, "up"))}><Up /><span className="visually-hidden">{t.settings.up}</span></button>
                  <button type="button" className="icon-button small" disabled={pending || i === open.length - 1} title={t.settings.down} onClick={() => run(() => moveStage(s.id, "down"))}><Down /><span className="visually-hidden">{t.settings.down}</span></button>
                  <button type="button" className="icon-button small" disabled={pending} title={t.settings.remove} onClick={() => run(() => removeStage(s.id), t.settings.removed)}><Trash /><span className="visually-hidden">{t.settings.remove}</span></button>
                </span>
              ) : <span className="stage-tools label-mono">{t.settings.end}</span>}
            </li>
          );
        })}
      </ol>
      <form className="add-stage" onSubmit={e => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        run(async () => { const r = await addStage(String(data.get("name") ?? ""), String(data.get("probability") ?? "50")); if (r.ok) form.reset(); return r; });
      }}>
        <label className="visually-hidden" htmlFor="new-stage">{t.settings.add}</label>
        <input id="new-stage" name="name" className="field" maxLength={40} placeholder={t.settings.addPlaceholder} required />
        <label className="visually-hidden" htmlFor="new-p">{t.settings.probability}</label>
        <input id="new-p" name="probability" className="field num" type="number" min={0} max={100} step={5} defaultValue={50} />
        <button type="submit" className="button" disabled={pending}><Plus />{t.settings.add}</button>
      </form>
    </div>
  );
}
