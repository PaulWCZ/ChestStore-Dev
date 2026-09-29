"use client";

import { Avatar, Confirm, PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Bin, Check, Down, Pencil, Plus, Up } from "../../../../../components/icons.tsx";
import { format } from "../../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { limits } from "../../../../../lib/model.ts";
import { addInterviewer, addStage, moveStage, removeInterviewer, removeJob, removeStage, renameStage } from "../../../actions.ts";

type Words = { jobSettings: Catalogue["jobSettings"]; errors: Catalogue["errors"]; common: Catalogue["common"]; peoplePicker: PeoplePickerWords };
type StageRow = { id: string; name: string; hired: boolean; count: number };

export function JobSettingsView({ jobId, stages, interviewers, choices, deletable, locale, t }: {
  jobId: string; stages: StageRow[]; interviewers: { id: string; name: string; photo: string | null }[]; choices: { id: string; name: string; role: string; photo: string | null }[]; deletable: boolean; locale: string; t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The team as the kit's people picker reads it: a name, its role under it.
  const team: Choice[] = useMemo(() => choices.map(c => ({ id: c.id, name: c.name, ...(c.role ? { detail: c.role } : {}), photo: c.photo })), [choices]);
  const search = useMemo(() => localSearch(team), [team]);
  const w = t.jobSettings;
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, done?: string) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
      else if (done) toast(done);
    });
  const movable = stages.filter(s => !s.hired);

  return (
    <div className="settings-stack">
      <section className="panel" aria-labelledby="stages">
        <h2 id="stages">{w.stages}</h2>
        <p className="hint">{w.stagesHint}</p>
        <ol className="stage-list">
          {stages.map(s => {
            const i = movable.findIndex(m => m.id === s.id);
            return (
              <li key={s.id} className={s.hired ? "hired" : undefined}>
                {editing === s.id ? (
                  <form className="inline-form" onSubmit={e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name") ?? ""); setEditing(null); run(() => renameStage(s.id, name)); }}>
                    <label className="visually-hidden" htmlFor={`stage-${s.id}`}>{w.stageName}</label>
                    <input id={`stage-${s.id}`} name="name" className="field" defaultValue={s.name} maxLength={limits.stageName} autoFocus onKeyDown={e => { if (e.key === "Escape") setEditing(null); }} />
                    <button type="submit" className="icon-button" title={t.common.save}><Check /><span className="visually-hidden">{t.common.save}</span></button>
                  </form>
                ) : (
                  <>
                    <span className="stage-name">{s.name}</span>
                    {s.hired && <span className="muted small">{w.hired}</span>}
                    <span className="stage-count">{s.count}</span>
                    <span className="row-actions">
                      <button type="button" className="button link small" onClick={() => setEditing(s.id)} aria-label={`${w.rename} · ${s.name}`}><Pencil />{w.rename}</button>
                      {!s.hired && <button type="button" className="icon-button" disabled={pending || i === 0} onClick={() => run(() => moveStage(s.id, "up"))} title={w.up}><Up /><span className="visually-hidden">{w.up} · {s.name}</span></button>}
                      {!s.hired && <button type="button" className="icon-button" disabled={pending || i === movable.length - 1} onClick={() => run(() => moveStage(s.id, "down"))} title={w.down}><Down /><span className="visually-hidden">{w.down} · {s.name}</span></button>}
                      {!s.hired && <button type="button" className="button link small" disabled={pending} onClick={() => run(() => removeStage(s.id))} aria-label={`${t.common.remove} · ${s.name}`}><Bin />{t.common.remove}</button>}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get("name") ?? ""); form.reset(); run(() => addStage(jobId, name)); }}>
          <label className="visually-hidden" htmlFor="new-stage">{w.stageName}</label>
          <input id="new-stage" name="name" className="field" maxLength={limits.stageName} placeholder={w.stagePlaceholder} required />
          <button type="submit" className="button quiet" disabled={pending}><Plus />{w.addStage}</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="interviewers">
        <h2 id="interviewers">{w.interviewers}</h2>
        <p className="hint">{w.interviewersHint}</p>
        {interviewers.length === 0 ? <p className="muted">{w.none}</p> : (
          <ul className="people-list">
            {interviewers.map(p => (
              <li key={p.id}>
                <Avatar name={p.name} photo={p.photo} size="m" />
                <span className="person-name">{p.name}</span>
                <button type="button" className="button link small" disabled={pending} onClick={() => run(() => removeInterviewer(jobId, p.id))}>{w.takeOff}<span className="visually-hidden"> · {p.name}</span></button>
              </li>
            ))}
          </ul>
        )}
        {choices.length > 0 && (
          <div className="interviewer-pick">
            <PeoplePicker
              id="pick"
              label={w.pick}
              hint={w.pickHint}
              value={[]}
              search={search}
              suggestions={team}
              disabled={pending}
              labels={{ ...t.peoplePicker, recent: w.team }}
              lang={locale}
              onChange={chosen => {
                const who = chosen[0];
                if (who) run(() => addInterviewer(jobId, who.id), format(w.added, { name: who.name }));
              }}
            />
          </div>
        )}
      </section>

      {deletable && (
        <section className="panel danger-zone" aria-labelledby="danger">
          <h2 id="danger">{w.danger}</h2>
          <p className="hint">{w.deleteHint}</p>
          <div><button type="button" className="button danger" disabled={pending} onClick={() => setDeleting(true)}><Bin />{w.deleteDraft}</button></div>
          <Confirm
            open={deleting}
            title={w.deleteTitle}
            body={w.deleteBody}
            confirmLabel={w.deleteDraft}
            cancelLabel={t.common.cancel}
            busy={pending}
            onCancel={() => setDeleting(false)}
            onConfirm={() => start(async () => {
              const r = await removeJob(jobId);
              if (!r.ok) return void toast({ text: t.errors[r.error], tone: "error" });
              setDeleting(false);
              toast(w.deleted);
              router.push("/chest");
            })}
          />
        </section>
      )}
    </div>
  );
}
