import { Avatar } from "@argentic/chest-ui/components";
import { useEffect, useId, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Reply } from "../components/icons.tsx";
import { call, toast } from "../core/client.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "./words.ts";

// The comments of a post and one level of replies: written, edited and
// deleted (with Undo) in place, at once on the screen (optimistic), then
// confirmed by the server — a refusal puts it back and call() says why.
// "@" and the start of a name proposes the people who see the post.
type Errors = Catalogue["errors"];

type Piece = { t: "text"; v: string } | { t: "mention"; name: string };
export type CommentView = { id: string; parentId: string | null; author: string; photo: string | null; mine: boolean; when: string; date: string; raw: string; pieces: Piece[]; names: Record<string, string>; edited: boolean };
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
  const [, start] = useTransition();
  const [shown, change] = useOptimistic(thread, (list: CommentView[], c: Change) => {
    if (c.type === "add") return [...list, c.comment];
    if (c.type === "remove") return list.filter(x => x.id !== c.id && x.parentId !== c.id);
    return list.map(x => (x.id === c.id ? { ...x, raw: c.raw, pieces: c.pieces, edited: true } : x));
  });
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // Running in the browser: its buttons answer.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [editing, setEditing] = useState<string | null>(null);

  function send(body: string, chosen: Map<string, string>, parentId: string | null): boolean {
    const raw = toTokens(body.trim(), chosen);
    if (!raw) return false;
    start(async () => {
      change({ type: "add", comment: { id: "pending", parentId, author: you, photo: me.photo, mine: true, when: "", date: "", raw, pieces: piecesOf(body.trim(), chosen), names: {}, edited: false } });
      await call("addComment", { postId: id, body: raw, parentId });
    });
    setReplyTo(null);
    return true;
  }

  function remove(commentId: string) {
    start(async () => {
      change({ type: "remove", id: commentId });
      const r = await call("removeComment", { commentId });
      if (!r.ok) return;
      toast({
        id: `delete-comment-${commentId}`,
        text: t.deleted,
        undo: async () => {
          const back = await call("restoreComment", { commentId }, { quiet: true });
          return back.ok ? true : back.message;
        },
      });
    });
  }

  function save(c: CommentView, body: string, chosen: Map<string, string>): boolean {
    const raw = toTokens(body.trim(), chosen);
    if (!raw) { toast({ text: errors.empty, tone: "error" }); return false; }
    setEditing(null);
    start(async () => {
      change({ type: "edit", id: c.id, raw, pieces: piecesOf(body.trim(), chosen) });
      await call("editComment", { commentId: c.id, body: raw });
    });
    return true;
  }

  const top = shown.filter(c => c.parentId === null);
  const repliesOf = (parent: string) => shown.filter(c => c.parentId === parent);
  const item = (c: CommentView, reply: boolean) => (
    <li key={c.id} id={"comment-" + c.id} className={"comment" + (reply ? " reply" : "") + (c.id === "pending" ? " pending" : "")}>
      <Avatar name={c.author} photo={c.photo} size="m" {...(reply ? { className: "avatar-28" } : {})} />
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
    <section className="comments" id="comments" aria-labelledby="comments-title" data-ready={ready ? "" : undefined}>
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
        <Avatar name={me.name} photo={me.photo} size="m" />
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
  const caret = useRef<number | null>(null);
  const fieldId = useId();
  useEffect(() => {
    if (!query) return setFound([]);
    let stale = false;
    const timer = setTimeout(async () => {
      const r = await call("mentionable", { postId, query }, { refresh: false, quiet: true });
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
    const at = el?.selectionStart ?? text.length;
    const before = text.slice(0, at).replace(/@([\p{L}\p{M}'-]{1,30})$/u, "@" + person.name + " ");
    const next = before + text.slice(at);
    setText(next);
    setChosen(current => new Map(current).set(person.name, person.id));
    setQuery(null);
    // Back to the box at once, the caret after the name — set when the new
    // text is on screen (a later frame would move it under what is typed next).
    caret.current = before.length;
    el?.focus();
  }
  useLayoutEffect(() => {
    if (caret.current === null || !box.current) return;
    box.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);
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

