"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar, useToast } from "@argentic/chest-ui/components";
import { Alert } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { addComment, editComment, removeComment, restoreComment } from "../../actions.ts";

type CommentView = { id: string; author: { name: string; photo: string | null }; mine: boolean; body: string; when: string; date: string; edited: boolean };
type Words = { comments: Catalogue["comments"]; errors: Catalogue["errors"] };

// The conversation about an objective: newest last, a box at the bottom.
// Deleting is undone from the toast.
export function Comments({ objectiveId, isAdmin, comments, t }: { objectiveId: string; me: string; isAdmin: boolean; comments: CommentView[]; t: Words }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const c = t.comments;
  const words = (code: keyof typeof t.errors, values: Record<string, string | number> = {}) => format(t.errors[code], values);

  function post() {
    const body = draft.trim();
    if (!body) return setError(t.errors.empty);
    start(async () => {
      const r = await addComment(objectiveId, body);
      if (!r.ok) return setError(words(r.error, r.values));
      setDraft("");
      setError(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    setHidden(h => [...h, id]);
    start(async () => {
      const r = await removeComment(id);
      if (!r.ok) {
        setHidden(h => h.filter(x => x !== id));
        return void toast({ text: words(r.error, r.values), tone: "error" });
      }
      toast({
        id: `comment-${id}`,
        text: c.removed,
        undo: async () => {
          const b = await restoreComment(id);
          if (!b.ok) return words(b.error, b.values);
          setHidden(h => h.filter(x => x !== id));
          router.refresh();
          return true;
        },
      });
      router.refresh();
    });
  }

  function saveEdit() {
    if (!editing) return;
    start(async () => {
      const r = await editComment(editing.id, editing.body);
      if (!r.ok) return void toast({ text: words(r.error, r.values), tone: "error" });
      setEditing(null);
      router.refresh();
    });
  }

  const shown = comments.filter(x => !hidden.includes(x.id));
  return (
    <section className="card card-pad stack" aria-labelledby="comments-title" id="comments">
      <h2 id="comments-title">{c.title}</h2>
      {shown.length === 0 ? <p className="muted">{c.empty}</p> : (
        <ul className="comments">
          {shown.map(x => (
            <li key={x.id} className="comment">
              <Avatar name={x.author.name} photo={x.author.photo} size="m" />
              <div className="stack-s">
                <div className="meta"><strong className="author">{x.author.name}</strong><time title={x.date}>{x.when}</time>{x.edited && <span>· {c.edited}</span>}</div>
                {editing?.id === x.id ? (
                  <form className="comment-form" onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                    <label className="visually-hidden" htmlFor={`edit-${x.id}`}>{c.edit}</label>
                    <textarea id={`edit-${x.id}`} className="field" rows={3} maxLength={2000} value={editing.body} onChange={e => setEditing({ id: x.id, body: e.target.value })} />
                    <div className="row"><button type="submit" className="button small" disabled={pending}>{c.save}</button><button type="button" className="button quiet small" onClick={() => setEditing(null)}>{c.cancel}</button></div>
                  </form>
                ) : <p className="body">{x.body}</p>}
                {editing?.id !== x.id && (x.mine || isAdmin) && (
                  <div className="row">
                    {x.mine && <button type="button" className="link-button" onClick={() => setEditing({ id: x.id, body: x.body })}>{c.edit}</button>}
                    <button type="button" className="link-button danger" onClick={() => remove(x.id)}>{c.remove}</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={e => { e.preventDefault(); post(); }}>
        <label className="visually-hidden" htmlFor="new-comment">{c.label}</label>
        <textarea id="new-comment" className="field" rows={2} maxLength={2000} value={draft} placeholder={c.placeholder} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }} aria-invalid={error ? true : undefined} />
        {error && <p className="error" role="alert"><Alert />{error}</p>}
        <div className="row"><button type="submit" className="button" disabled={pending}>{c.post}</button></div>
      </form>
    </section>
  );
}
