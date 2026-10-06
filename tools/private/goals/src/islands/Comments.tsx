import { call, toast } from "@argentic/chest-app/client";
import { Avatar } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Alert } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

export type CommentView = { id: string; author: { name: string; photo: string | null }; mine: boolean; body: string; when: string; date: string; edited: boolean };
type Words = { comments: Catalogue["comments"]; errors: Catalogue["errors"] };

// The conversation about an objective: newest last, a box at the bottom.
// Deleting is undone from the toast.
export function Comments({ objectiveId, isAdmin, comments, t }: { objectiveId: string; isAdmin: boolean; comments: CommentView[]; t: Words }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const c = t.comments;
  // One change at a time from this list.
  async function act(step: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    try { await step(); } finally { setPending(false); }
  }

  function post() {
    const body = draft.trim();
    if (!body) return setError(t.errors.empty);
    void act(async () => {
      const r = await call("addComment", { objectiveId, body }, { quiet: true });
      if (!r.ok) return setError(r.message);
      setDraft("");
      setError(null);
    });
  }

  // Deleting goes at once; the toast's Undo brings it back.
  function remove(id: string) {
    setHidden(h => [...h, id]);
    void act(async () => {
      const r = await call("removeComment", { id });
      if (!r.ok) return setHidden(h => h.filter(x => x !== id));
      toast({
        id: `comment-${id}`,
        text: c.removed,
        undo: async () => {
          const b = await call("restoreComment", { id }, { quiet: true });
          if (!b.ok) return b.message;
          setHidden(h => h.filter(x => x !== id));
          return true;
        },
      });
    });
  }

  function saveEdit() {
    if (!editing) return;
    void act(async () => {
      const r = await call("editComment", { id: editing.id, body: editing.body });
      if (r.ok) setEditing(null);
    });
  }

  const shown = comments.filter(x => !hidden.includes(x.id));
  return (
    <section className="card card-pad stack" aria-labelledby="comments-title" id="comments">
      <h2 id="comments-title">{c.title}</h2>
      {shown.length === 0 ? <p className="muted">{c.empty}</p> : (
        <ul className="comments">
          {shown.map(x => (
            <li key={x.id} id={`comment-${x.id}`} className="comment">
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
