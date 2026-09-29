"use client";

import { Avatar, EmptyState, useToast } from "@argentic/chest-ui/components";
import { useOptimistic, useRef, useState, useTransition } from "react";
import type { ErrorCode } from "../../lib/errors.ts";
import { format, plural } from "../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../lib/i18n/index.ts";
import { deleteNote, pinNote, postNote, undoDelete } from "./actions.ts";

export type NoteView = { id: string; body: string; pinned: boolean; mine: boolean; author: string; photo: string | null; when: string; date: string };
type Words = { notes: Catalogue["notes"]; errors: Catalogue["errors"]; you: string };
type Change = { type: "add"; note: NoteView } | { type: "remove"; id: string } | { type: "pin"; id: string; pinned: boolean };

const max = 500;

// The notes, changed at once on screen (optimistic), then confirmed by the
// server; a refusal puts things back and says why.
export function NotesView({ notes, locale, canWrite, canPin, canRemoveAny, me, t }: { notes: NoteView[]; locale: Locale; canWrite: boolean; canPin: boolean; canRemoveAny: boolean; me: { name: string; photo: string | null }; t: Words }) {
  const [shown, change] = useOptimistic(notes, (list: NoteView[], c: Change) => {
    if (c.type === "add") return [c.note, ...list];
    if (c.type === "remove") return list.filter(n => n.id !== c.id);
    return list.map(n => (n.id === c.id ? { ...n, pinned: c.pinned } : n)).sort((a, b) => Number(b.pinned) - Number(a.pinned));
  });
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const field = useRef<HTMLTextAreaElement>(null);
  const words = (code: ErrorCode, values: Record<string, number | string> = {}) => format(t.errors[code], values);

  function post(text: string) {
    const body = text.trim();
    if (!body) {
      setError(words("empty"));
      field.current?.focus();
      return;
    }
    setError(null);
    setDraft("");
    startTransition(async () => {
      change({ type: "add", note: { id: "pending", body, pinned: false, mine: true, author: t.you, photo: me.photo, when: "", date: "" } });
      const result = await postNote(body);
      if (!result.ok) {
        setDraft(body);
        setError(words(result.error, result.values));
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      change({ type: "remove", id });
      const result = await deleteNote(id);
      if (!result.ok) return void toast({ text: words(result.error), tone: "error" });
      // One toast per note; its Undo says whether it worked (the kit's toast).
      toast({
        id: `delete-${id}`,
        text: t.notes.removed,
        undo: async () => {
          const back = await undoDelete(id);
          return back.ok ? true : words(back.error);
        },
      });
    });
  }

  function pin(id: string, pinned: boolean) {
    startTransition(async () => {
      change({ type: "pin", id, pinned });
      const result = await pinNote(id, pinned);
      if (!result.ok) toast({ text: words(result.error), tone: "error" });
    });
  }

  const length = [...draft].length;
  return (
    <>
      <h1>{t.notes.title}</h1>
      {canWrite ? (
        <form className="composer" onSubmit={e => { e.preventDefault(); post(draft); }}>
          <label htmlFor="note" className="visually-hidden">{t.notes.placeholder}</label>
          <textarea
            id="note"
            ref={field}
            className="field"
            value={draft}
            maxLength={max}
            placeholder={t.notes.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "note-error" : undefined}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(draft); }}
          />
          <div className="row">
            <span className="count" aria-hidden="true">{length > max - 100 ? `${length} / ${max}` : ""}</span>
            {error && <span id="note-error" className="error" role="alert">{error}</span>}
            <button type="submit" className="button">{t.notes.add}</button>
          </div>
        </form>
      ) : <p className="meta">{t.notes.readOnly}</p>}

      {shown.length === 0 ? (
        <EmptyState
          title={t.notes.empty.title}
          body={t.notes.empty.body}
          example={canWrite ? { label: t.notes.empty.example, onClick: () => post(t.notes.exampleText) } : null}
        />
      ) : (
        <>
          <p className="meta">{plural(t.notes.count, shown.length, locale)}</p>
          <ul className="notes">
            {shown.map(n => (
              <li key={n.id} id={"note-" + n.id} className={"note" + (n.pinned ? " pinned" : "") + (n.id === "pending" ? " pending" : "")}>
                <p>{n.body}</p>
                <div className="meta">
                  <Avatar name={n.author} photo={n.photo} size="s" />
                  <span>{format(t.notes.by, { name: n.author })}</span>
                  {n.when && <time title={n.date}>{n.when}</time>}
                  {n.pinned && <span className="tag">{t.notes.pinned}</span>}
                  {n.id !== "pending" && (
                    <span className="actions">
                      {canPin && <button type="button" className="button link" onClick={() => pin(n.id, !n.pinned)}>{n.pinned ? t.notes.unpin : t.notes.pin}</button>}
                      {(n.mine || canRemoveAny) && <button type="button" className="button link" onClick={() => remove(n.id)}>{t.notes.remove}</button>}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
