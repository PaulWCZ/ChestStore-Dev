"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash } from "../../../../../../../components/icons.tsx";
import { useToast } from "../../../../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../../../lib/i18n/index.ts";
import { format } from "../../../../../../../lib/i18n/format.ts";
import { deleteAnswer, followAnswer, restoreAnswer } from "../../../../../actions.ts";

const say = (errors: Catalogue["errors"], code: ErrorCode, values?: Record<string, string | number>) => format(errors[code] ?? errors.unknown, values ?? {});

// Delete an answer, with Undo (kept aside a week, then gone for good).
export function AnswerActions({ formId, answerId, deleted, t }: { formId: string; answerId: string; deleted: boolean; t: { a: Catalogue["answers"]; errors: Catalogue["errors"] } }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const restore = () => start(async () => {
    const r = await restoreAnswer(formId, answerId);
    if (!r.ok) toast(say(t.errors, r.error, r.values));
    router.refresh();
  });
  if (deleted) return <div className="row-actions"><button type="button" className="button quiet" disabled={pending} onClick={restore}>{t.a.restore}</button></div>;
  return (
    <div className="row-actions">
      <button type="button" className="button quiet danger" disabled={pending} onClick={() => start(async () => {
        const r = await deleteAnswer(formId, answerId);
        if (!r.ok) return void toast(say(t.errors, r.error, r.values));
        toast(t.a.deleted, { label: t.a.undo, run: restore });
        router.refresh();
      })}><Trash />{t.a.delete}</button>
    </div>
  );
}

// Following an answer up: its state in one tap, and a note. On a team
// form, the person who sent it sees both in "What you sent" and is told in
// the bell. Saved as it changes (the note when it is left).
export function FollowUp({ formId, answerId, status, note, canEdit, team, t }: { formId: string; answerId: string; status: "new" | "doing" | "done"; note: string; canEdit: boolean; team: boolean; locale: string; t: { f: Catalogue["follow"]; errors: Catalogue["errors"] } }) {
  const [state, setState] = useState(status);
  const [text, setText] = useState(note);
  const [saved, setSaved] = useState(note);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const send = (input: { status?: string; note?: string }, done: string) => start(async () => {
    const r = await followAnswer(formId, answerId, input);
    if (!r.ok) return void toast(say(t.errors, r.error, r.values));
    if (input.note !== undefined) setSaved(input.note);
    toast(done);
    router.refresh();
  });
  if (!canEdit) {
    return (
      <section className="follow-up panel">
        <h2>{t.f.title}</h2>
        <p><span className={`follow follow-${state}`}>{t.f.states[state]}</span></p>
        {note && <p className="follow-note">{note}</p>}
      </section>
    );
  }
  return (
    <section className="follow-up panel" aria-labelledby="follow-title">
      <h2 id="follow-title">{t.f.title}</h2>
      <div className="segmented follow-states" role="group" aria-label={t.f.label}>
        {(["new", "doing", "done"] as const).map(s => (
          <button key={s} type="button" aria-pressed={state === s} disabled={pending} onClick={() => { if (s === state) return; setState(s); send({ status: s }, t.f.moved[s]); }}>{t.f.states[s]}</button>
        ))}
      </div>
      <label className="mini block">
        <span className="mini-label">{team ? t.f.noteTeam : t.f.note}</span>
        <textarea className="field" rows={3} maxLength={2000} value={text} placeholder={team ? t.f.notePlaceholderTeam : t.f.notePlaceholder} onChange={e => setText(e.target.value)}
          onBlur={() => { if (text.trim() !== saved.trim()) send({ note: text }, t.f.noteSaved); }} />
      </label>
      {team && <p className="hint">{t.f.teamHint}</p>}
    </section>
  );
}
