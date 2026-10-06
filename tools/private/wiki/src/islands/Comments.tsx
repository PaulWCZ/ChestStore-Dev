import { call, fill as format, plural, toast } from "@argentic/chest-app/client";
import { Avatar } from "@argentic/chest-ui/components";
import { searchChoices } from "@argentic/chest-ui/components/logic";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { CommentView } from "../actions.ts";
import { Chat } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { limits, linkParts } from "../shared/model.ts";

type Words = { comments: Catalogue["comments"]; locale: string };

// The conversation at the bottom of a page: its comments, oldest first, and
// a field to add one. Each person edits and removes their own; the page's
// editors may remove any (with Undo). Web addresses become links; nothing
// else is interpreted. Typing "@" and the start of a name offers the people
// who read the page; the one picked is written "@Name" and told in the bell.
//
// A conversation: a comment at the top and its replies (one level; "Reply"
// under any of them). Resolved, it folds to one line ("Resolved by …",
// Show, Reopen). A comment may be about a passage: select words in the
// page, "Comment on this passage"; the comment quotes them, and a click on
// the quote selects them in the page again.
export function Comments({ pageId, initial, me, moderator, people = [], t }: { pageId: string; initial: CommentView[]; me: string; moderator: boolean; people?: { id: string; name: string }[]; t: Words }) {
  const [list, setList] = useState(initial);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const words = t.comments;
  // The passage chosen in the page, and where to offer it.
  const [quote, setQuote] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ text: string; top: number; left: number } | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);
  useEffect(() => {
    const prose = document.querySelector(".prose");
    if (!prose) return;
    const onSelect = () => {
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/gu, " ").trim() : "";
      if (!sel || !text || sel.rangeCount === 0 || !prose.contains(sel.anchorNode) || !prose.contains(sel.focusNode)) return setOffer(null);
      const box = sel.getRangeAt(0).getBoundingClientRect();
      setOffer({ text: [...text].slice(0, limits.quote).join(""), top: box.bottom + window.scrollY + 6, left: Math.max(8, Math.min(box.left + window.scrollX, document.documentElement.clientWidth - 260)) });
    };
    document.addEventListener("selectionchange", onSelect);
    // Words selected before the page ran are offered too.
    onSelect();
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);
  function about(text: string) {
    setQuote(text);
    setOffer(null);
    field.current?.focus();
    field.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  // "@" mentions: who was picked, and the list offered while typing a name.
  const [named, setNamed] = useState<{ id: string; name: string }[]>([]);
  const [asking, setAsking] = useState<{ query: string; at: number; index: number } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // The store's one search rule for people (the kit's): accents and case
  // aside, the start of any word of the name.
  const offered = asking ? searchChoices(people, asking.query).slice(0, 6) : [];
  function typed(value: string, caret: number) {
    setText(value);
    const m = /(^|\s)@([\p{L}'’-]{0,24})$/u.exec(value.slice(0, caret));
    setAsking(m && people.length > 0 ? { query: m[2]!, at: caret - m[2]!.length - 1, index: 0 } : null);
  }
  function pick(person: { id: string; name: string }) {
    if (!asking) return;
    const caret = field.current?.selectionStart ?? text.length;
    const next = text.slice(0, asking.at) + "@" + person.name + " " + text.slice(caret);
    // The field changes at once (not at the next render): a fast typist's
    // next letter lands after the name.
    const at = asking.at + person.name.length + 2;
    if (field.current) {
      field.current.value = next;
      field.current.setSelectionRange(at, at);
    }
    setText(next);
    setNamed(list => (list.some(x => x.id === person.id) ? list : [...list, person]));
    setAsking(null);
  }
  // The page re-reads itself now and then (others comment too): take the
  // server's thread when it changed, unless a comment is being edited.
  const signature = initial.map(c => `${c.id}:${c.edited ? c.body : ""}:${c.resolved ? 1 : 0}`).join(",");
  useEffect(() => {
    if (editing === null) setList(initial);
  }, [signature]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const result = await call("addComment", { pageId, body, mentioned: named.filter(p => body.includes("@" + p.name)).map(p => p.id), quote }, { refresh: false, quiet: true });
      if (!result.ok) return setError(result.message);
      setList(l => [...l, result.value]);
      setText("");
      setNamed([]);
      setQuote(null);
    });
  }

  function save(id: string, body: string) {
    start(async () => {
      const result = await call("editComment", { commentId: id, body }, { refresh: false });
      if (!result.ok) return;
      setList(l => l.map(c => (c.id === id ? { ...result.value, when: c.when } : c)));
      setEditing(null);
    });
  }

  function remove(c: CommentView) {
    const at = list.findIndex(x => x.id === c.id);
    setList(l => l.filter(x => x.id !== c.id));
    start(async () => {
      const result = await call("removeComment", { commentId: c.id }, { refresh: false });
      if (!result.ok) return void setList(l => [...l.slice(0, at), c, ...l.slice(at)]);
      toast({
        id: `comment-${c.id}`,
        text: words.removed,
        undo: async () => {
          const back = await call("restoreComment", { commentId: c.id }, { refresh: false, quiet: true });
          if (!back.ok) return back.message;
          setList(l => [...l.slice(0, at), c, ...l.slice(at)]);
          return true;
        },
      });
    });
  }

  function reply(topId: string, body: string): Promise<boolean> {
    return new Promise(done => start(async () => {
      const result = await call("addComment", { pageId, body, mentioned: [], parentId: topId }, { refresh: false });
      if (!result.ok) return done(false);
      setList(l => [...l.map(c => (c.id === topId ? { ...c, resolved: false } : c)), result.value]);
      setReplying(null);
      done(true);
    }));
  }

  function resolve(top: CommentView, resolved: boolean) {
    start(async () => {
      const result = await call("resolveComment", { commentId: top.id, resolved }, { refresh: false });
      if (!result.ok) return;
      setList(l => l.map(c => (c.id === top.id ? { ...result.value, when: c.when } : c)));
      setOpened(o => o.filter(x => x !== top.id));
    });
  }

  // One comment: who, when, the passage it is about, its words, its actions.
  function one(c: CommentView, top: boolean) {
    return (
      <div id={`comment-${c.id}`} className="comment">
        <Avatar name={c.name} photo={c.photo} />
        <div className="bubble">
          <p className="comment-who">
            <strong>{c.author === me ? words.you : c.name}</strong>
            <time dateTime={c.at}>{c.when}</time>
            {c.edited && <span>· {words.edited}</span>}
          </p>
          {c.quote && (
            <blockquote className="comment-quote">
              <button type="button" className="quote-link" title={words.findQuote} onClick={() => { if (!findInPage(c.quote!)) toast({ text: words.quoteGone }); }}>{c.quote}</button>
            </blockquote>
          )}
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
      </div>
    );
  }

  return (
    <section className="comments" id="comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="kicker"><Chat />{plural(t.locale, words.count, list.length)}</h2>
      {list.length > 0 ? (
        <ol className="thread">
          {list.filter(c => !c.parentId).map(top => {
            const replies = list.filter(r => r.parentId === top.id);
            const folded = top.resolved && !opened.includes(top.id);
            return (
              <li key={top.id} className="conversation">
                {folded ? (
                  <p className="resolved-line">
                    <span className="resolved-start">{[...top.body].slice(0, 70).join("")}{[...top.body].length > 70 ? "…" : ""}</span>
                    <span>{format(words.resolvedBy, { name: top.resolvedBy ?? words.you })} · {plural(t.locale, words.replies, replies.length + 1)}</span>
                    <button type="button" className="link-button" onClick={() => setOpened(o => [...o, top.id])}>{words.show}</button>
                    {(top.author === me || moderator) && <button type="button" className="link-button" onClick={() => resolve(top, false)}>{words.reopen}</button>}
                  </p>
                ) : (
                  <>
                    {one(top, true)}
                    {replies.length > 0 && <ol className="replies">{replies.map(r => <li key={r.id}>{one(r, false)}</li>)}</ol>}
                    <div className="conversation-actions">
                      <button type="button" className="link-button" aria-expanded={replying === top.id} onClick={() => setReplying(replying === top.id ? null : top.id)}>{words.reply}</button>
                      {(top.author === me || moderator) && <button type="button" className="link-button" onClick={() => resolve(top, !top.resolved)}>{top.resolved ? words.reopen : words.resolve}</button>}
                    </div>
                    {replying === top.id && <ReplyBox topId={top.id} onSend={reply} pending={pending} words={words} />}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">{words.empty}</p>
      )}
      {offer && createPortal(<QuoteOffer offer={offer} label={words.quoteButton} onChoose={about} />, document.body)}
      <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
        {quote && (
          <div className="quote-chosen">
            <span className="small muted">{words.quoteLabel}</span>
            <blockquote className="comment-quote">{quote}</blockquote>
            <button type="button" className="link-button" onClick={() => setQuote(null)}>{words.removeQuote}</button>
          </div>
        )}
        <label className="visually-hidden" htmlFor="comment-new">{words.label}</label>
        <textarea ref={field} id="comment-new" className="field" rows={2} maxLength={limits.comment} value={text} placeholder={words.placeholder}
          aria-describedby={error ? "comment-error" : undefined}
          aria-controls={offered.length > 0 ? "mention-list" : undefined}
          aria-activedescendant={asking && offered[asking.index] ? `mention-${offered[asking.index]!.id}` : undefined}
          onChange={e => typed(e.target.value, e.target.selectionStart)}
          onBlur={() => setAsking(null)}
          onKeyDown={e => {
            if (asking && offered.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setAsking({ ...asking, index: (asking.index + (e.key === "ArrowDown" ? 1 : offered.length - 1)) % offered.length });
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(offered[asking.index]!); return; }
              if (e.key === "Escape") { e.preventDefault(); setAsking(null); return; }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
          }} />
        {offered.length > 0 && asking && (
          <ul className="mentions" role="listbox" id="mention-list" aria-label={words.mention}>
            {offered.map((p, i) => (
              <li key={p.id} id={`mention-${p.id}`} role="option" aria-selected={i === asking.index} onMouseDown={e => { e.preventDefault(); pick(p); }}>@{p.name}</li>
            ))}
          </ul>
        )}
        {error && <p id="comment-error" className="error" role="alert">{error}</p>}
        <div className="row-actions"><button type="submit" className="button small" disabled={pending || !text.trim()}>{words.send}</button></div>
      </form>
    </section>
  );
}


// "Comment on this passage", under the words selected in the page. Placed
// through its element's style (the page's policy refuses a style
// attribute, not a script setting one).
function QuoteOffer({ offer, label, onChoose }: { offer: { text: string; top: number; left: number }; label: string; onChoose: (text: string) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const el = button.current;
    if (!el) return;
    el.style.top = `${offer.top}px`;
    el.style.left = `${offer.left}px`;
  }, [offer.top, offer.left]);
  return (
    <button ref={button} type="button" className="button small quote-offer" onMouseDown={e => e.preventDefault()} onClick={() => onChoose(offer.text)}>
      <Chat />{label}
    </button>
  );
}

// A reply's own small field, under its conversation.
function ReplyBox({ topId, onSend, pending, words }: { topId: string; onSend: (topId: string, body: string) => Promise<boolean>; pending: boolean; words: Catalogue["comments"] }) {
  const [text, setText] = useState("");
  return (
    <form className="reply-box" onSubmit={e => { e.preventDefault(); const body = text.trim(); if (body) void onSend(topId, body).then(ok => { if (ok) setText(""); }); }}>
      <label className="visually-hidden" htmlFor={`reply-${topId}`}>{words.replyLabel}</label>
      <textarea id={`reply-${topId}`} className="field" rows={2} maxLength={limits.comment} value={text} autoFocus placeholder={words.replyPlaceholder} onChange={e => setText(e.target.value)} />
      <div className="row-actions"><button type="submit" className="button small" disabled={pending || !text.trim()}>{words.replySend}</button></div>
    </form>
  );
}

// findInPage selects a quoted passage in the page's text and brings it
// into view; false when the page no longer holds it.
function findInPage(quote: string): boolean {
  const prose = document.querySelector(".prose");
  if (!prose) return false;
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let all = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: all.length });
    all += (n as Text).data;
  }
  // Spaces as the quote has them: runs of white space are one space.
  const flat: number[] = [];
  let text = "";
  for (let i = 0; i < all.length; i++) {
    if (/\s/u.test(all[i]!) && (text.endsWith(" ") || text === "")) continue;
    text += /\s/u.test(all[i]!) ? " " : all[i];
    flat.push(i);
  }
  const at = text.indexOf(quote);
  if (at < 0) return false;
  const from = flat[at]!, to = flat[at + quote.length - 1]! + 1;
  const place = (offset: number) => {
    const hit = [...nodes].reverse().find(x => x.start <= offset)!;
    return { node: hit.node, offset: Math.min(offset - hit.start, hit.node.data.length) };
  };
  const a = place(from), b = place(to);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  a.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}
