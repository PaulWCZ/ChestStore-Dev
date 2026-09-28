"use client";

import { useEffect, useState, useTransition } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { Chat } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, moment, plural } from "../../../../lib/i18n/format.ts";
import { limits, linkParts } from "../../../../lib/model.ts";
import { addComment, editComment, removeComment, restoreComment, type CommentView } from "../../actions.ts";

type Words = { comments: Catalogue["comments"]; errors: Catalogue["errors"]; locale: string };

// The conversation at the bottom of a page: its comments, oldest first, and
// a field to add one. Each person edits and removes their own; the page's
// editors may remove any (with Undo). Web addresses become links; nothing
// else is interpreted.
export function Comments({ pageId, initial, me, moderator, t }: { pageId: string; initial: CommentView[]; me: string; moderator: boolean; t: Words }) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const words = t.comments;
  // The page re-reads itself now and then (others comment too): take the
  // server's thread when it changed, unless a comment is being edited.
  const signature = initial.map(c => `${c.id}:${c.edited ? c.body : ""}`).join(",");
  useEffect(() => {
    if (editing === null) setList(initial);
  }, [signature]);
  const fail = (result: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => format(t.errors[result.error], result.values);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const result = await addComment(pageId, body);
      if (!result.ok) return setError(fail(result));
      setList(l => [...l, result.value]);
      setText("");
    });
  }

  function save(id: string, body: string) {
    start(async () => {
      const result = await editComment(id, body);
      if (!result.ok) return toast(fail(result));
      setList(l => l.map(c => (c.id === id ? { ...result.value, when: c.when } : c)));
      setEditing(null);
    });
  }

  function remove(c: CommentView) {
    const at = list.findIndex(x => x.id === c.id);
    setList(l => l.filter(x => x.id !== c.id));
    start(async () => {
      const result = await removeComment(c.id);
      if (!result.ok) {
        setList(l => [...l.slice(0, at), c, ...l.slice(at)]);
        return toast(fail(result));
      }
      toast(words.removed, { label: words.undo, run: async () => {
        const back = await restoreComment(c.id);
        if (!back.ok) return toast(fail(back));
        setList(l => [...l.slice(0, at), c, ...l.slice(at)]);
      } });
    });
  }

  return (
    <section className="comments" id="comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="kicker"><Chat />{plural(words.count, list.length, t.locale)}</h2>
      {list.length > 0 ? (
        <ol className="thread">
          {list.map(c => (
            <li key={c.id} id={`comment-${c.id}`} className="comment">
              <Avatar name={c.name} photo={c.photo} />
              <div className="bubble">
                <p className="comment-who">
                  <strong>{c.author === me ? words.you : c.name}</strong>
                  <time dateTime={c.at}>{c.when || moment(c.at, t.locale)}</time>
                  {c.edited && <span>· {words.edited}</span>}
                </p>
                {editing === c.id ? (
                  <form className="stack" onSubmit={e => { e.preventDefault(); save(c.id, String(new FormData(e.currentTarget).get("body") ?? "")); }}>
                    <label className="visually-hidden" htmlFor={`edit-${c.id}`}>{words.label}</label>
                    <textarea id={`edit-${c.id}`} name="body" className="field" rows={3} maxLength={limits.comment} defaultValue={c.body} autoFocus required />
                    <div className="row-actions">
                      <button type="submit" className="button small" disabled={pending}>{words.save}</button>
                      <button type="button" className="button small quiet" onClick={() => setEditing(null)}>{words.cancel}</button>
                    </div>
                  </form>
                ) : (
                  <p className="comment-body">{linkParts(c.body).map((part, i) => (part.href ? <a key={i} href={part.href} rel="noopener noreferrer nofollow">{part.text}</a> : part.text))}</p>
                )}
                {editing !== c.id && (c.author === me || moderator) && (
                  <div className="comment-actions" role="group" aria-label={format(words.actions, { name: c.author === me ? words.you : c.name })}>
                    {c.author === me && <button type="button" className="link-button" onClick={() => setEditing(c.id)}>{words.edit}</button>}
                    <button type="button" className="link-button danger" onClick={() => remove(c)}>{words.remove}</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{words.empty}</p>
      )}
      <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <label className="visually-hidden" htmlFor="comment-new">{words.label}</label>
        <textarea id="comment-new" className="field" rows={2} maxLength={limits.comment} value={text} placeholder={words.placeholder}
          aria-describedby={error ? "comment-error" : undefined}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        {error && <p id="comment-error" className="error" role="alert">{error}</p>}
        <div className="row-actions"><button type="submit" className="button small" disabled={pending || !text.trim()}>{words.send}</button></div>
      </form>
    </section>
  );
}
