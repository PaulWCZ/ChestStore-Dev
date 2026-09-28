"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { PriorityChip, Waiting } from "../../../../components/badges.tsx";
import { FilePicker, filesPending, type PickedFile } from "../../../../components/file-picker.tsx";
import { Back, Check, Clip, Cross, Eye, Globe, Mail, Note, Quote, Send, Tag } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { limits, priorities, type Priority, type Status } from "../../../../lib/model.ts";
import { addTag, assign, fileUpload, note, removeTag, reply, setPriority, setStatus } from "../../actions.ts";

type Words = { ticket: Catalogue["ticket"]; errors: Catalogue["errors"]; people: Catalogue["people"]; priority: Catalogue["priority"]; files: Catalogue["files"] };
type Tag = { id: string; name: string };
type View = {
  ticket: { number: number; subject: string; status: Status; channel: "form" | "email" | "team"; customerName: string; customerEmail: string; assignee: string | null; created: string; priority: Priority; tags: Tag[]; waiting: { text: string; late: boolean; lateText: string } | null };
  tagNames: string[];
  messages: { id: string; kind: "customer" | "reply" | "note"; who: string; typedBy: string | null; photo: string | null; body: string; when: string; date: string; delivery: "email" | "page" | null; attachments: { id: string; fileName: string; size: string }[] }[];
  others: { number: number; subject: string; status: Status; when: string }[];
  viewing: string[];
  team: { id: string; name: string; photo: string | null }[];
  replies: { id: string; title: string; filled: string }[];
  me: string;
  canAnswer: boolean;
  canManage: boolean;
  locale: string;
  t: Words;
};

// A ticket: read the conversation, answer (or leave a note for the team),
// and move it along. Sending clears the box at once; a refusal gives the
// text back.
export function TicketView({ ticket, tagNames, messages, others, viewing, team, replies, me, canAnswer, canManage, locale, t }: View) {
  const w = t.ticket;
  const toast = useToast();
  const [, start] = useTransition();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [priority, showPriority] = useOptimistic(ticket.priority);
  const [tags, showTags] = useOptimistic(ticket.tags);
  const [newTag, setNewTag] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values ?? { max: 20000 }));

  function send(close: boolean) {
    const body = text.trim();
    if (!body) return field.current?.focus();
    if (filesPending(files)) return toast(t.files.wait);
    const attached = files.filter(f => f.ref).map(f => ({ ref: f.ref!, name: f.name }));
    setSending(true);
    start(async () => {
      const result = mode === "reply" ? await reply(ticket.number, body, close, attached) : await note(ticket.number, body, attached);
      setSending(false);
      if (!result.ok) return fail(result.error, result.values);
      setText("");
      setFiles([]);
      if (mode === "note") return toast(w.noteToast);
      const delivery = (result.value as { delivery?: string } | null)?.delivery;
      toast(close ? w.closedToast : delivery === "page" ? w.viaPage : w.sentToast);
    });
  }
  const act = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"] }>, done?: string, undo?: () => Promise<unknown>) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) return fail(r.error);
      if (done) toast(done, undo ? { label: w.undo, run: () => start(async () => { await undo(); }) } : undefined);
    });
  function changePriority(value: Priority) {
    start(async () => {
      showPriority(value);
      const r = await setPriority(ticket.number, value);
      if (!r.ok) return fail(r.error);
      toast(format(w.priorityToast, { priority: t.priority[value] }));
    });
  }
  function tagIt(name: string) {
    const text = name.trim().replace(/\s+/gu, " ");
    if (!text) return;
    setNewTag("");
    if (tags.some(g => g.name.toLowerCase() === text.toLowerCase())) return;
    start(async () => {
      showTags([...tags, { id: "new", name: text }]);
      const r = await addTag(ticket.number, text);
      if (!r.ok) {
        setNewTag(text);
        return fail(r.error, r.values ?? { max: limits.tag });
      }
    });
  }
  function untag(tag: Tag) {
    start(async () => {
      showTags(tags.filter(g => g.id !== tag.id));
      const r = await removeTag(ticket.number, tag.id);
      if (!r.ok) fail(r.error);
    });
  }
  function insert(body: string) {
    if (menu.current) menu.current.open = false;
    setText(current => (current.trim() ? current.replace(/\s*$/u, "\n\n") + body : body));
    requestAnimationFrame(() => field.current?.focus());
  }

  const statusChip = <span className={`chip ${ticket.status}`}>{w.statuses[ticket.status]}</span>;
  return (
    <div className="ticket">
      <div>
        <div className="ticket-head">
          <Link className="back" href="/chest"><Back />{w.back}</Link>
          <h1>{ticket.subject}</h1>
          <p className="row muted small"><span>#{ticket.number}</span>{statusChip}<PriorityChip priority={priority} label={t.priority[priority]} />{ticket.waiting && <Waiting {...ticket.waiting} />}<span>{w.channel[ticket.channel]}</span><span>{ticket.created}</span></p>
          {viewing.length > 0 && <p className="viewing" role="status"><Eye />{format(viewing.length > 1 ? w.viewingMany : w.viewing, { names: viewing.join(", ") })}</p>}
        </div>
        <ol className="thread">
          {messages.map(m => (
            <li key={m.id} className={`msg ${m.kind === "customer" ? "" : "team"} ${m.kind === "note" ? "note" : ""}`}>
              <Avatar name={m.who} photo={m.photo} />
              <div className="bubble">
                <div className="who">{m.who}{m.kind === "note" && <span className="chip spam">{w.noteTag}</span>}<time dateTime={m.date} title={m.date}>{m.when}</time></div>
                {m.typedBy && <p className="small muted">{m.typedBy}</p>}
                <div className="body">{m.body}</div>
                {m.attachments.length > 0 && (
                  <div className="files" aria-label={w.files}>
                    {m.attachments.map(a => <a key={a.id} href={`/chest/files/${a.id}`} target="_blank" rel="noopener"><Clip />{a.fileName}<span className="size">{a.size}</span></a>)}
                  </div>
                )}
                {m.kind === "reply" && m.delivery && <p className="delivery">{m.delivery === "email" ? <><Mail />{w.viaEmail}</> : <><Globe /><span title={w.viaPageHint}>{w.viaPage}</span></>}</p>}
              </div>
            </li>
          ))}
        </ol>
        {canAnswer ? (
          <form className={`composer${mode === "note" ? " is-note" : ""}`} onSubmit={e => { e.preventDefault(); send(false); }}>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "reply"} onClick={() => setMode("reply")}><Send /> {w.reply}</button>
              <button type="button" role="tab" aria-selected={mode === "note"} onClick={() => setMode("note")}><Note /> {w.note}</button>
            </div>
            <label htmlFor="answer" className="visually-hidden">{mode === "reply" ? w.reply : w.note}</label>
            <textarea id="answer" ref={field} value={text} maxLength={20000} placeholder={mode === "reply" ? w.replyPlaceholder : w.notePlaceholder}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(false); } }} />
            <div className="attach"><FilePicker items={files} setItems={setFiles} upload={fileUpload} kind="team" locale={locale} t={{ files: t.files, errors: t.errors }} /></div>
            <div className="actions">
              {mode === "reply" ? (
                <>
                  <button type="submit" className="button" disabled={sending || !text.trim()}><Send />{w.send}</button>
                  <button type="button" className="button quiet" disabled={sending || !text.trim()} onClick={() => send(true)}><Check />{w.sendClose}</button>
                </>
              ) : <button type="submit" className="button" disabled={sending || !text.trim()}><Note />{w.addNote}</button>}
              <span className="spacer" />
              <details className="menu" ref={menu}>
                <summary className="button quiet small"><Quote />{w.saved}</summary>
                <div className="menu-pop">
                  {replies.length === 0 ? <p className="hint" style={{ padding: "var(--space-2)" }}>{w.noSaved}</p> : replies.map(r => (
                    <button key={r.id} type="button" onClick={() => insert(r.filled)}><strong>{r.title}</strong><small>{r.filled}</small></button>
                  ))}
                </div>
              </details>
            </div>
          </form>
        ) : <p className="notice">{w.cannotAnswer}</p>}
      </div>

      <aside className="side-card" aria-label={w.customer}>
        <div className="fact">
          <p className="label">{w.from}</p>
          <p><strong>{ticket.customerName || ticket.customerEmail}</strong></p>
          {ticket.customerName && <p className="small"><a href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a></p>}
        </div>
        <div className="fact">
          <label className="label" htmlFor="assignee">{w.assignee}</label>
          {canManage ? (
            <div className="row">
              <select id="assignee" className="select" value={ticket.assignee ?? ""} onChange={e => act(() => assign(ticket.number, e.target.value || null))}>
                <option value="">{w.nobody}</option>
                {team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {ticket.assignee !== me && canAnswer && <button type="button" className="link-button" onClick={() => act(() => assign(ticket.number, me))}>{w.takeIt}</button>}
            </div>
          ) : <p>{team.find(p => p.id === ticket.assignee)?.name ?? w.nobody}</p>}
        </div>
        <div className="fact">
          <label className="label" htmlFor="priority">{w.priority}</label>
          {canManage ? (
            <select id="priority" className="select" value={priority} onChange={e => changePriority(e.target.value as Priority)}>
              {priorities.map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
            </select>
          ) : <p>{t.priority[priority]}</p>}
        </div>
        <div className="fact">
          <p className="label" id="tags-label">{w.tags}</p>
          {tags.length > 0 ? (
            <ul className="tag-list" aria-labelledby="tags-label">
              {tags.map(g => (
                <li key={g.id + g.name} className="chip tag">
                  <Link href={`/chest?tag=${g.id}`} aria-label={format(w.tagTickets, { tag: g.name })}><Tag />{g.name}</Link>
                  {canManage && g.id !== "new" && <button type="button" className="untag" aria-label={format(w.removeTag, { tag: g.name })} onClick={() => untag(g)}><Cross /></button>}
                </li>
              ))}
            </ul>
          ) : <p className="small muted">{w.noTags}</p>}
          {canManage && (
            <form className="row add-tag" onSubmit={e => { e.preventDefault(); tagIt(newTag); }}>
              <label htmlFor="new-tag" className="visually-hidden">{w.tagLabel}</label>
              <input id="new-tag" className="field" list="tag-names" value={newTag} maxLength={limits.tag} placeholder={w.tagPlaceholder} autoComplete="off" onChange={e => setNewTag(e.target.value)} />
              <datalist id="tag-names">{tagNames.filter(n => !tags.some(g => g.name === n)).map(n => <option key={n} value={n} />)}</datalist>
              <button type="submit" className="button small quiet" disabled={!newTag.trim()}>{w.addTag}</button>
            </form>
          )}
        </div>
        <div className="fact">
          <p className="label">{w.status}</p>
          <div className="row">
            {statusChip}
            {canManage && (ticket.status === "closed" || ticket.status === "spam"
              ? <button type="button" className="button small quiet" onClick={() => act(() => setStatus(ticket.number, "open"))}>{ticket.status === "spam" ? w.notSpam : w.reopen}</button>
              : <>
                  <button type="button" className="button small quiet" onClick={() => act(() => setStatus(ticket.number, "closed"), w.closedToast, () => setStatus(ticket.number, ticket.status))}><Check />{w.close}</button>
                  <button type="button" className="link-button danger" onClick={() => act(() => setStatus(ticket.number, "spam"))}>{w.markSpam}</button>
                </>)}
          </div>
        </div>
        {others.length > 0 && (
          <div className="fact">
            <p className="label">{w.others}</p>
            <ul className="others">
              {others.map(o => <li key={o.number}><Link href={`/chest/tickets/${o.number}`}>{o.subject}</Link> <span className="small muted">#{o.number} · {w.statuses[o.status]} · {o.when}</span></li>)}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
