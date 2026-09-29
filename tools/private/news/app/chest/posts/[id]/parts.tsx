"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { Check, Clock, Pen, Pin, Reply, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { addComment, answerEvent, confirmRead, deletePost, editComment, mentionable, pinPost, react, recallPost, release, remind, removeComment, restoreComment, restorePost } from "../../actions.ts";

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

export function ConfirmBox({ id, own, confirmed, again, when, t, errors }: { id: string; own: boolean; confirmed: boolean; again: boolean; when: string | null; t: Catalogue["important"]; errors: Errors }) {
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
          <p>{again ? t.again : t.ask}</p>
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

// A new Important post in its "Undo" seconds, seen by its author: take it
// back (nothing was sent), or let it go — at the end it goes out.
export function SendingNotice({ id, until, t, errors }: { id: string; until: string; t: Catalogue["post"]; errors: Errors }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(until).getTime();
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    const done = setTimeout(async () => { await release(); router.refresh(); }, Math.max(0, end - Date.now()) + 300);
    return () => { clearInterval(timer); clearTimeout(done); };
  }, [until, router]);
  return (
    <p className="notice sending" role="status">
      <Clock />
      <span>{left === null ? t.goingOut : format(t.goingOutIn, { seconds: left })}</span>
      <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
        const r = await recallPost(id);
        if (!r.ok) return toast(say(errors, r.error, r.values));
        toast(t.recalled);
        router.push("/chest/new");
      })}>{t.undoSend}</button>
    </p>
  );
}

export function Rsvp({ id, answer, open, full, t, errors }: { id: string; answer: "yes" | "no" | "wait" | null; open: boolean; full: boolean; t: Catalogue["event"]; errors: Errors }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [mine, setMine] = useOptimistic(answer);
  if (!open) return <p className="quiet-text">{t.closed}</p>;
  const choose = (value: "yes" | "no") => start(async () => {
    const taking = mine === value || (value === "yes" && mine === "wait");
    const next = taking ? null : value;
    setMine(next === "yes" && full ? "wait" : next);
    const r = await answerEvent(id, next);
    if (!r.ok) toast(say(errors, r.error, r.values));
    else if (r.value.answer === "wait") toast(t.youWait);
  });
  const coming = mine === "yes" || mine === "wait";
  return (
    <div className="rsvp" role="group" aria-labelledby={`rsvp-${id}`}>
      <p id={`rsvp-${id}`} className="rsvp-question">{mine === "yes" ? t.youCome : mine === "wait" ? t.youWait : mine === "no" ? t.youDont : full ? t.full : t.question}</p>
      <div className="row">
        <button type="button" className={"button" + (coming ? " chosen" : " quiet")} aria-pressed={coming} onClick={() => choose("yes")}><Check />{mine === "wait" ? t.waitingButton : full && mine !== "yes" ? t.join : t.coming}</button>
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

type Piece = { t: "text"; v: string } | { t: "mention"; name: string };
type CommentView = { id: string; parentId: string | null; author: string; photo: string | null; mine: boolean; when: string; date: string; raw: string; pieces: Piece[]; names: Record<string, string>; edited: boolean };
type Change = { type: "add"; comment: CommentView } | { type: "remove"; id: string } | { type: "edit"; id: string; raw: string; pieces: Piece[] };

// Mentions: typed as "@Name" (the list proposes who sees the post), kept as
// @[mbr_…] so a later change of name follows.
function toTokens(text: string, chosen: Map<string, string>): string {
  let out = text;
  for (const [name, memberId] of [...chosen].sort((a, b) => b[0].length - a[0].length)) out = out.split("@" + name).join(`@[${memberId}]`);
  return out;
}
function toNames(raw: string, names: Record<string, string>): { text: string; chosen: Map<string, string> } {
  const chosen = new Map<string, string>();
  const text = raw.replace(/@\[(mbr_[a-z2-7]{26})\]/gu, (_all, memberId: string) => {
    const name = names[memberId];
    if (!name) return "@";
    chosen.set(name, memberId);
    return "@" + name;
  });
  return { text, chosen };
}
function piecesOf(text: string, chosen: Map<string, string>): Piece[] {
  const names = new Map([...chosen].map(([name, memberId]) => [memberId, name]));
  const out: Piece[] = [];
  let at = 0;
  const tokens = toTokens(text, chosen);
  for (const m of tokens.matchAll(/@\[(mbr_[a-z2-7]{26})\]/gu)) {
    if (m.index > at) out.push({ t: "text", v: tokens.slice(at, m.index) });
    out.push({ t: "mention", name: names.get(m[1]!) ?? "" });
    at = m.index + m[0].length;
  }
  if (at < tokens.length) out.push({ t: "text", v: tokens.slice(at) });
  return out;
}

export function Comments({ id, thread, canModerate, me, t, errors, locale, you }: { id: string; thread: CommentView[]; canModerate: boolean; me: { name: string; photo: string | null }; t: Catalogue["comments"]; errors: Errors; locale: string; you: string }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [shown, change] = useOptimistic(thread, (list: CommentView[], c: Change) => {
    if (c.type === "add") return [...list, c.comment];
    if (c.type === "remove") return list.filter(x => x.id !== c.id && x.parentId !== c.id);
    return list.map(x => (x.id === c.id ? { ...x, raw: c.raw, pieces: c.pieces, edited: true } : x));
  });
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  function send(body: string, chosen: Map<string, string>, parentId: string | null): boolean {
    const raw = toTokens(body.trim(), chosen);
    if (!raw) return false;
    start(async () => {
      change({ type: "add", comment: { id: "pending", parentId, author: you, photo: me.photo, mine: true, when: "", date: "", raw, pieces: piecesOf(body.trim(), chosen), names: {}, edited: false } });
      const r = await addComment(id, raw, parentId);
      if (!r.ok) toast(say(errors, r.error, r.values));
    });
    setReplyTo(null);
    return true;
  }

  function remove(commentId: string) {
    start(async () => {
      change({ type: "remove", id: commentId });
      const r = await removeComment(commentId);
      if (!r.ok) return toast(say(errors, r.error, r.values));
      toast(t.deleted, { label: t.undo, run: () => start(async () => { const back = await restoreComment(commentId); if (!back.ok) toast(say(errors, back.error)); }) });
    });
  }

  function save(c: CommentView, body: string, chosen: Map<string, string>): boolean {
    const raw = toTokens(body.trim(), chosen);
    if (!raw) { toast(errors.empty); return false; }
    setEditing(null);
    start(async () => {
      change({ type: "edit", id: c.id, raw, pieces: piecesOf(body.trim(), chosen) });
      const r = await editComment(c.id, raw);
      if (!r.ok) toast(say(errors, r.error, r.values));
    });
    return true;
  }

  const top = shown.filter(c => c.parentId === null);
  const repliesOf = (parent: string) => shown.filter(c => c.parentId === parent);
  const item = (c: CommentView, reply: boolean) => (
    <li key={c.id} id={"comment-" + c.id} className={"comment" + (reply ? " reply" : "") + (c.id === "pending" ? " pending" : "")}>
      <Avatar name={c.author} photo={c.photo} size={reply ? 28 : 32} />
      <div className="comment-body">
        <p className="comment-meta"><strong>{c.author}</strong>{c.when && <time title={c.date}>{c.when}</time>}{c.edited && <span>{t.edited}</span>}</p>
        {editing === c.id ? (
          <Writer postId={id} label={t.label} initial={toNames(c.raw, c.names)} submit={t.save} onSubmit={(body, chosen) => save(c, body, chosen)} onCancel={() => setEditing(null)} t={t} errors={errors} autoFocus />
        ) : <p className="comment-text">{c.pieces.map((piece, i) => (piece.t === "text" ? piece.v : <strong key={i} className="mention">@{piece.name}</strong>))}</p>}
        {c.id !== "pending" && editing !== c.id && (
          <p className="comment-actions">
            {!reply && <button type="button" className="link-button" aria-expanded={replyTo === c.id} onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}><Reply />{t.reply}</button>}
            {c.mine && <button type="button" className="link-button" onClick={() => setEditing(c.id)}>{t.edit}</button>}
            {(c.mine || canModerate) && <button type="button" className="link-button" onClick={() => remove(c.id)}>{t.delete}</button>}
          </p>
        )}
      </div>
    </li>
  );

  return (
    <section className="comments" id="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">{plural(t.title, shown.length, locale)}</h2>
      {shown.length === 0 && <p className="quiet-text">{t.empty}</p>}
      <ol className="thread">
        {top.map(c => (
          <li key={c.id} className="comment-group">
            <ol className="thread-inner">
              {item(c, false)}
              {repliesOf(c.id).map(r => item(r, true))}
            </ol>
            {replyTo === c.id && (
              <div className="reply-form">
                <Writer postId={id} label={format(t.replyTo, { name: c.author })} initial={{ text: "", chosen: new Map() }} submit={t.reply} onSubmit={(body, chosen) => send(body, chosen, c.id)} onCancel={() => setReplyTo(null)} t={t} errors={errors} autoFocus />
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="comment-form">
        <Avatar name={me.name} photo={me.photo} size={32} />
        <Writer postId={id} label={t.label} initial={{ text: "", chosen: new Map() }} submit={t.send} onSubmit={(body, chosen) => send(body, chosen, null)} placeholder={t.placeholder} t={t} errors={errors} />
      </div>
    </section>
  );
}

// A box to write a comment or a reply: "@" and the start of a name proposes
// the people who see the post; Ctrl+Enter sends.
function Writer({ postId, label, initial, submit, onSubmit, onCancel, placeholder, t, errors, autoFocus = false }: {
  postId: string; label: string; initial: { text: string; chosen: Map<string, string> }; submit: string;
  onSubmit: (body: string, chosen: Map<string, string>) => boolean; onCancel?: () => void; placeholder?: string; t: Catalogue["comments"]; errors: Errors; autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial.text);
  const [chosen, setChosen] = useState(initial.chosen);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  useEffect(() => {
    if (!query) return setFound([]);
    let stale = false;
    const timer = setTimeout(async () => {
      const r = await mentionable(postId, query);
      if (!stale) setFound(r.ok ? r.value : []);
    }, 150);
    return () => { stale = true; clearTimeout(timer); };
  }, [query, postId]);
  function typed(value: string) {
    setText(value);
    setError(null);
    const caret = box.current?.selectionStart ?? value.length;
    const m = /(?:^|\s)@([\p{L}\p{M}'-]{1,30})$/u.exec(value.slice(0, caret));
    setQuery(m ? m[1]! : null);
  }
  function pick(person: { id: string; name: string }) {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{M}'-]{1,30})$/u, "@" + person.name + " ");
    const next = before + text.slice(caret);
    setText(next);
    setChosen(current => new Map(current).set(person.name, person.id));
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }
  function go() {
    if (!text.trim()) return setError(errors.empty);
    if (onSubmit(text, chosen)) { setText(""); setChosen(new Map()); setQuery(null); }
  }
  return (
    <form className="stack writer" onSubmit={e => { e.preventDefault(); go(); }}>
      <label htmlFor={fieldId} className="visually-hidden">{label}</label>
      <textarea
        id={fieldId}
        ref={box}
        className="field"
        value={text}
        maxLength={2000}
        placeholder={placeholder ?? label}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ""}`}
        onChange={e => typed(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); }
          if (e.key === "Escape" && query) { e.preventDefault(); setQuery(null); }
        }}
      />
      <p id={`${fieldId}-hint`} className="hint">{t.mentionHint}</p>
      {found.length > 0 && (
        <ul className="suggestions" aria-label={t.mentionList}>
          {found.map(p => <li key={p.id}><button type="button" onClick={() => pick(p)}>@{p.name}</button></li>)}
        </ul>
      )}
      {error && <p id={`${fieldId}-error`} className="error" role="alert">{error}</p>}
      <div className="row">
        {onCancel && <button type="button" className="button quiet small" onClick={onCancel}>{t.cancel}</button>}
        <button type="submit" className="button small">{submit}</button>
      </div>
    </form>
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
