"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { Check, Pen, Pin, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { addComment, answerEvent, confirmRead, deletePost, editComment, pinPost, react, remind, removeComment, restoreComment, restorePost } from "../../actions.ts";

// The parts of a post a person acts on. Each changes the screen at once
// (optimistic), then the server confirms; a refusal puts it back and says
// why, in a toast.
type Errors = Catalogue["errors"];
const say = (errors: Errors, code: ErrorCode, values: Record<string, number | string> = {}) => format(errors[code], values);

export function PostTools({ id, pinned, t, errors }: { id: string; pinned: boolean; t: Catalogue["post"]; errors: Errors }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [isPinned, setPinned] = useOptimistic(pinned);
  return (
    <div className="tools" role="group" aria-label={t.actions}>
      <a className="button quiet small" href={`/chest/posts/${id}/edit`}><Pen />{t.edit}</a>
      <button type="button" className="button quiet small" aria-pressed={isPinned} onClick={() => start(async () => {
        setPinned(!isPinned);
        const r = await pinPost(id, !isPinned);
        toast(r.ok ? (isPinned ? t.unpinnedToast : t.pinnedToast) : say(errors, r.error, r.values));
      })}><Pin />{isPinned ? t.unpin : t.pin}</button>
      <button type="button" className="button quiet small danger" onClick={() => start(async () => {
        const r = await deletePost(id);
        if (!r.ok) return toast(say(errors, r.error, r.values));
        router.push("/chest");
        toast(t.deleted, { label: t.undo, run: () => start(async () => {
          const back = await restorePost(id);
          if (!back.ok) return toast(say(errors, back.error));
          router.push(`/chest/posts/${id}`);
        }) });
      })}><Trash />{t.delete}</button>
    </div>
  );
}

export function ConfirmBox({ id, own, confirmed, when, t, errors }: { id: string; own: boolean; confirmed: boolean; when: string | null; t: Catalogue["important"]; errors: Errors }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [done, setDone] = useOptimistic(confirmed);
  if (own) return <p className="confirm-box own">{t.own}</p>;
  return (
    <div className={"confirm-box" + (done ? " done" : "")} role="region" aria-label={t.confirm}>
      {done ? (
        <p><Check />{when ?? t.thanks}</p>
      ) : (
        <>
          <p>{t.ask}</p>
          <button type="button" className="button" onClick={() => start(async () => {
            setDone(true);
            const r = await confirmRead(id);
            toast(r.ok ? t.thanks : say(errors, r.error, r.values));
          })}><Check />{t.confirm}</button>
        </>
      )}
    </div>
  );
}

export function Rsvp({ id, answer, open, t, errors }: { id: string; answer: "yes" | "no" | null; open: boolean; t: Catalogue["event"]; errors: Errors }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [mine, setMine] = useOptimistic(answer);
  if (!open) return <p className="quiet-text">{t.closed}</p>;
  const choose = (value: "yes" | "no") => start(async () => {
    const next = mine === value ? null : value;
    setMine(next);
    const r = await answerEvent(id, next);
    if (!r.ok) toast(say(errors, r.error, r.values));
  });
  return (
    <div className="rsvp" role="group" aria-labelledby={`rsvp-${id}`}>
      <p id={`rsvp-${id}`} className="rsvp-question">{mine === "yes" ? t.youCome : mine === "no" ? t.youDont : t.question}</p>
      <div className="row">
        <button type="button" className={"button" + (mine === "yes" ? " chosen" : " quiet")} aria-pressed={mine === "yes"} onClick={() => choose("yes")}><Check />{t.coming}</button>
        <button type="button" className={"button" + (mine === "no" ? " chosen-no" : " quiet")} aria-pressed={mine === "no"} onClick={() => choose("no")}>{t.notComing}</button>
      </div>
    </div>
  );
}

type ReactionView = { emoji: string; symbol: string; count: number; mine: boolean; names: string[] };

export function Reactions({ id, list, t, errors, locale }: { id: string; list: ReactionView[]; t: Catalogue["reactions"]; errors: Errors; locale: string }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [shown, toggle] = useOptimistic(list, (current: ReactionView[], emoji: string) => current.map(r => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)));
  return (
    <div className="reactions" role="group" aria-label={t.label}>
      {shown.map(r => {
        const label = t[r.emoji as "thumbs"];
        const others = r.count - r.names.length;
        const names = r.names.join(", ") + (others > 0 ? " " + plural(t.more, others, locale) : "");
        return (
          <button key={r.emoji} type="button" className={"reaction" + (r.mine ? " mine" : "")} aria-pressed={r.mine} title={r.count > 0 ? format(t.by, { emoji: label, names }) : label} onClick={() => start(async () => {
            toggle(r.emoji);
            const done = await react(id, r.emoji, !r.mine);
            if (!done.ok) toast(say(errors, done.error, done.values));
          })}>
            <span aria-hidden="true">{r.symbol}</span>
            <span className="visually-hidden">{label}</span>
            {r.count > 0 && <span className="count">{r.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

type CommentView = { id: string; author: string; photo: string | null; mine: boolean; when: string; date: string; body: string; edited: boolean };
type Change = { type: "add"; comment: CommentView } | { type: "remove"; id: string } | { type: "edit"; id: string; body: string };

export function Comments({ id, thread, canModerate, me, t, errors, locale, you }: { id: string; thread: CommentView[]; canModerate: boolean; me: { name: string; photo: string | null }; t: Catalogue["comments"]; errors: Errors; locale: string; you: string }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [shown, change] = useOptimistic(thread, (list: CommentView[], c: Change) => {
    if (c.type === "add") return [...list, c.comment];
    if (c.type === "remove") return list.filter(x => x.id !== c.id);
    return list.map(x => (x.id === c.id ? { ...x, body: c.body, edited: true } : x));
  });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  function send() {
    const body = draft.trim();
    if (!body) return setError(errors.empty);
    setError(null);
    setDraft("");
    start(async () => {
      change({ type: "add", comment: { id: "pending", author: you, photo: me.photo, mine: true, when: "", date: "", body, edited: false } });
      const r = await addComment(id, body);
      if (!r.ok) {
        setDraft(body);
        setError(say(errors, r.error, r.values));
      }
    });
  }

  function remove(commentId: string) {
    start(async () => {
      change({ type: "remove", id: commentId });
      const r = await removeComment(commentId);
      if (!r.ok) return toast(say(errors, r.error, r.values));
      toast(t.deleted, { label: t.undo, run: () => start(async () => { const back = await restoreComment(commentId); if (!back.ok) toast(say(errors, back.error)); }) });
    });
  }

  function save() {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return toast(errors.empty);
    setEditing(null);
    start(async () => {
      change({ type: "edit", id: editing.id, body });
      const r = await editComment(editing.id, body);
      if (!r.ok) toast(say(errors, r.error, r.values));
    });
  }

  return (
    <section className="comments" id="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">{plural(t.title, shown.length, locale)}</h2>
      {shown.length === 0 && <p className="quiet-text">{t.empty}</p>}
      <ol className="thread">
        {shown.map(c => (
          <li key={c.id} className={"comment" + (c.id === "pending" ? " pending" : "")}>
            <Avatar name={c.author} photo={c.photo} size={32} />
            <div className="comment-body">
              <p className="comment-meta"><strong>{c.author}</strong>{c.when && <time title={c.date}>{c.when}</time>}{c.edited && <span>{t.edited}</span>}</p>
              {editing?.id === c.id ? (
                <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
                  <label htmlFor={`edit-${c.id}`} className="visually-hidden">{t.label}</label>
                  <textarea id={`edit-${c.id}`} className="field" value={editing.body} maxLength={2000} onChange={e => setEditing({ id: c.id, body: e.target.value })} autoFocus />
                  <div className="row">
                    <button type="submit" className="button small">{t.save}</button>
                    <button type="button" className="button quiet small" onClick={() => setEditing(null)}>{t.cancel}</button>
                  </div>
                </form>
              ) : <p className="comment-text">{c.body}</p>}
              {c.id !== "pending" && editing?.id !== c.id && (c.mine || canModerate) && (
                <p className="comment-actions">
                  {c.mine && <button type="button" className="link-button" onClick={() => setEditing({ id: c.id, body: c.body })}>{t.edit}</button>}
                  <button type="button" className="link-button" onClick={() => remove(c.id)}>{t.delete}</button>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <form className="comment-form" onSubmit={e => { e.preventDefault(); send(); }}>
        <Avatar name={me.name} photo={me.photo} size={32} />
        <div className="stack">
          <label htmlFor="comment" className="visually-hidden">{t.label}</label>
          <textarea
            id="comment"
            className="field"
            value={draft}
            maxLength={2000}
            placeholder={t.placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "comment-error" : undefined}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
          />
          {error && <p id="comment-error" className="error" role="alert">{error}</p>}
          <div className="row"><button type="submit" className="button small">{t.send}</button></div>
        </div>
      </form>
    </section>
  );
}

export function RemindButton({ id, t, errors, locale }: { id: string; t: Catalogue["readers"]; errors: Errors; locale: string }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  return (
    <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
      const r = await remind(id);
      toast(r.ok ? plural(t.reminded, r.value.count, locale) : say(errors, r.error, r.values));
    })}>{t.remind}</button>
  );
}
