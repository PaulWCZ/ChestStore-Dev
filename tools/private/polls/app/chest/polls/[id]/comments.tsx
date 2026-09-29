"use client";

import { Avatar, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Chat, Trash } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { en } from "../../../../lib/i18n/en.ts";
import { deleteComment, postComment, restoreComment } from "../../actions.ts";

// Comments under a named poll: read by everyone who sees it, written by
// those it asks and those who manage it. Deleting is undone from the toast.
type Words = { comments: Record<keyof typeof en.comments, string>; errors: Record<keyof typeof en.errors, string> };
export type CommentView = { id: string; name: string; photo: string | null; when: string; body: string; removable: boolean };

export function Comments({ pollId, comments, canWrite, t }: { pollId: string; comments: CommentView[]; canWrite: boolean; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  async function post(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const result = await postComment(pollId, body);
    setBusy(false);
    if (!result.ok) return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    setBody("");
    router.refresh();
  }

  async function remove(id: string) {
    setHidden(h => [...h, id]);
    const result = await deleteComment(id);
    if (!result.ok) {
      setHidden(h => h.filter(x => x !== id));
      return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    }
    // One toast per comment; its Undo says whether the comment came back.
    toast({
      id: `comment-${id}`,
      text: t.comments.removed,
      undo: async () => {
        const back = await restoreComment(id);
        if (!back.ok) return format(t.errors[back.error], back.values ?? {});
        setHidden(h => h.filter(x => x !== id));
        router.refresh();
        return true;
      },
    });
    router.refresh();
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
