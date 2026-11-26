import { Segmented } from "@argentic/chest-ui/components";
import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Trash } from "../components/icons.tsx";
import { FollowBadge } from "../components/state-badge.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Delete an answer, with Undo (kept aside a week, then gone for good).
export function AnswerActions({ formId, answerId, deleted, t }: { formId: string; answerId: string; deleted: boolean; t: { delete: string; deleted: string; restore: string } }) {
  const [pending, setPending] = useState(false);
  const restore = async (): Promise<true | string> => {
    const r = await call("restoreAnswer", { id: formId, answer: answerId }, { quiet: true });
    return r.ok || r.message;
  };
  if (deleted) {
    return (
      <div className="row-actions">
        <button type="button" className="button quiet" disabled={pending} onClick={async () => {
          setPending(true);
          const r = await restore();
          setPending(false);
          if (r !== true) toast({ id: `answer-${answerId}`, text: r, tone: "error" });
        }}>{t.restore}</button>
      </div>
    );
  }
  return (
    <div className="row-actions">
      <button type="button" className="button quiet danger" disabled={pending} onClick={async () => {
        setPending(true);
        const r = await call("deleteAnswer", { id: formId, answer: answerId });
        setPending(false);
        if (r.ok) toast({ id: `answer-${answerId}`, text: t.deleted, undo: restore });
      }}><Trash />{t.delete}</button>
    </div>
  );
}

// Following an answer up: its state in one tap, and a note. On a team
// form, the person who sent it sees both in "What you sent" and is told in
// the bell. Saved as it changes (the note when it is left).
export function FollowUp({ formId, answerId, status, note, canEdit, team, t }: { formId: string; answerId: string; status: "new" | "doing" | "done"; note: string; canEdit: boolean; team: boolean; t: { f: Catalogue["follow"] } }) {
  const [state, setState] = useState(status);
  const [text, setText] = useState(note);
  const [saved, setSaved] = useState(note);
  const [pending, setPending] = useState(false);
  // The person who sent a team form is told in the bell at once: the
  // toast says it happened, with no Undo (a bell item already left).
  const send = async (input: { status?: "new" | "doing" | "done"; note?: string }, done: string) => {
    setPending(true);
    const r = await call("followAnswer", { id: formId, answer: answerId, ...input });
    setPending(false);
    if (!r.ok) return;
    if (input.note !== undefined) setSaved(input.note);
    toast({ id: input.note !== undefined ? `note-${answerId}` : `follow-${answerId}`, text: done, ...(team ? { sent: true } : {}) });
  };
  if (!canEdit) {
    return (
      <section className="follow-up panel">
        <h2>{t.f.title}</h2>
        <p><FollowBadge state={state} label={t.f.states[state]} /></p>
        {note && <p className="follow-note">{note}</p>}
      </section>
    );
  }
  return (
    <section className="follow-up panel" aria-labelledby="follow-title">
      <h2 id="follow-title">{t.f.title}</h2>
      <div className="follow-states">
        <Segmented label={t.f.label} value={state} disabled={pending} onChange={s => { if (s === state) return; setState(s); void send({ status: s }, t.f.moved[s]); }}
          options={(["new", "doing", "done"] as const).map(s => ({ value: s, label: t.f.states[s] }))} />
      </div>
      <label className="mini block">
        <span className="mini-label">{team ? t.f.noteTeam : t.f.note}</span>
        <textarea className="field" rows={3} maxLength={2000} value={text} placeholder={team ? t.f.notePlaceholderTeam : t.f.notePlaceholder} onChange={e => setText(e.target.value)}
          onBlur={() => { if (text.trim() !== saved.trim()) void send({ note: text }, t.f.noteSaved); }} />
      </label>
      {team && <p className="hint">{t.f.teamHint}</p>}
    </section>
  );
}
