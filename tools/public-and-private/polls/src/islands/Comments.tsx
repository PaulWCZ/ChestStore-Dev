import { Avatar } from "@argentic/chest-ui/components";
import { useState, type FormEvent } from "react";
import { Chat, Trash } from "../components/icons.tsx";
import { call, refresh, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";

// Comments under a named poll: read by everyone who sees it, written by
// those it asks and those who manage it. Deleting is undone from the toast.
type Words = { comments: Catalogue["comments"] };
export type CommentView = { id: string; name: string; photo: string | null; when: string; body: string; removable: boolean };

export function Comments({ pollId, comments, canWrite, t }: { pollId: string; comments: CommentView[]; canWrite: boolean; t: Words }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const result = await call("postComment", { pollId, body });
    setBusy(false);
    if (result.ok) setBody("");
  }

  async function remove(id: string) {
    setHidden(h => [...h, id]);
    const result = await call("deleteComment", { commentId: id });
    if (!result.ok) return setHidden(h => h.filter(x => x !== id));
    // One toast per comment; its Undo says whether the comment came back.
    toast({
      id: `comment-${id}`,
      text: t.comments.removed,
      undo: async () => {
        const back = await call("restoreComment", { commentId: id }, { quiet: true });
        if (!back.ok) return back.message;
        setHidden(h => h.filter(x => x !== id));
        return true;
      },
    });
  }

  const shown = comments.filter(c => !hidden.includes(c.id));
  return (
    <section className="card comments-card" id="comments" aria-labelledby="comments-title">
      <h2 id="comments-title"><Chat />{t.comments.title}</h2>
      {shown.length === 0 ? <p className="hint">{t.comments.none}</p> : (
        <ul className="comments">
          {shown.map(c => (
            <li key={c.id}>
              <Avatar name={c.name} photo={c.photo} size="m" />
              <div className="comment-body">
                <p className="comment-meta"><strong>{c.name}</strong> <span>{c.when}</span></p>
                <p className="comment-text">{c.body}</p>
              </div>
              {c.removable && <button type="button" className="icon-button" onClick={() => void remove(c.id)}><Trash /><span className="visually-hidden">{t.comments.removeLabel}</span></button>}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="comment-form" onSubmit={post}>
          <label className="visually-hidden" htmlFor="comment">{t.comments.label}</label>
          <textarea id="comment" className="field" rows={2} maxLength={1000} value={body} placeholder={t.comments.placeholder} onChange={e => setBody(e.target.value)} />
          <button type="submit" className="button" disabled={busy || !body.trim()}>{busy ? t.comments.posting : t.comments.post}</button>
        </form>
      )}
    </section>
  );
}
