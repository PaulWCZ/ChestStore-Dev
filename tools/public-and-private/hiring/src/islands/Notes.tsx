import { call } from "@argentic/chest-app/client";
import { useState } from "react";
import { Bin } from "../components/icons.tsx";
import { useWork } from "../components/use-work.ts";
import type { Catalogue } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";

type FeedbackWords = { candidate: Catalogue["candidate"] };

// The team's notes on a candidate: a recruiter writes one, removes their
// own; an interviewer reads them.
export function Notes({ candidateId, notes, canWrite, t }: { candidateId: string; notes: { id: string; authorName: string; body: string; when: string; mine: boolean }[]; canWrite: boolean; t: FeedbackWords }) {
  const [pending, start] = useWork();
  const [text, setText] = useState("");
  const w = t.candidate;
  return (
    <div>
      {notes.length === 0 ? <p className="muted">{w.noNotes}</p> : (
        <ul className="note-list">
          {notes.map(n => (
            <li key={n.id}>
              <div className="note-head"><strong>{n.authorName}</strong><span className="muted small">{n.when}</span>
                {n.mine && canWrite && <button type="button" className="button link small" onClick={() => start(() => call("removeNote", { id: n.id }))}><Bin />{w.removeNote}</button>}
              </div>
              <p className="pre">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="note-form" onSubmit={e => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          start(async () => {
            const r = await call("addNote", { id: candidateId, body });
            if (!r.ok) return;
            setText("");
          });
        }}>
          <label className="visually-hidden" htmlFor="note">{w.notes}</label>
          <textarea id="note" className="field" rows={3} maxLength={limits.note} value={text} onChange={e => setText(e.target.value)} placeholder={w.notePlaceholder} />
          <div className="form-actions"><button type="submit" className="button quiet small" disabled={pending || !text.trim()}>{w.addNote}</button></div>
        </form>
      )}
    </div>
  );
}

