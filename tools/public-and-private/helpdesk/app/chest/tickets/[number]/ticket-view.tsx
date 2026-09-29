"use client";

import { Avatar, Menu, PeoplePicker, Tabs, useToast } from "@argentic/chest-ui/components";
import { localSearch, type FileWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Attachments, filesPending, type PickedFile } from "../../../../components/attachments.tsx";
import { PriorityChip, StateBadge, Waiting } from "../../../../components/badges.tsx";
import { Body } from "../../../../components/body.tsx";
import { Alert, Back, Check, Clip, Cross, Download, Eye, Globe, Mail, Note, Quote, Send, Tag } from "../../../../components/icons.tsx";
import { busy } from "../../../../components/keys.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { limits, priorities, type Priority, type Status } from "../../../../lib/model.ts";
import { addTag, assign, fileUpload, merge, note, removeTag, reply, setCustomer, setPriority, setStatus, unmerge } from "../../actions.ts";

type Words = { ticket: Catalogue["ticket"]; errors: Catalogue["errors"]; people: Catalogue["people"]; priority: Catalogue["priority"]; files: FileWords & Catalogue["files"]; peoplePicker: PeoplePickerWords };
type Tag = { id: string; name: string };
type View = {
  ticket: { number: number; subject: string; status: Status; channel: "form" | "email" | "team" | "forms"; customerName: string; customerEmail: string; requester: string | null; source: { form: string; href: string | null } | null; assignee: string | null; created: string; priority: Priority; tags: Tag[]; waiting: { text: string; late: boolean; lateText: string } | null; bounce: { permanent: boolean; reason: string } | null; rating: "good" | "bad" | null };
  tagNames: string[];
  messages: {
    id: string; kind: "customer" | "reply" | "note" | "event"; who: string; typedBy: string | null; photo: string | null; body: string; when: string; date: string; delivery: "email" | "page" | null;
    attachments: { id: string; fileName: string; size: string; image: boolean }[];
    event: string | null; fromOther: string | null; email: boolean; html: string | null; original: boolean; auto: boolean; dropped: string[]; bounce: string | null;
  }[];
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
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [priority, showPriority] = useOptimistic(ticket.priority);
  const [tags, showTags] = useOptimistic(ticket.tags);
  const [newTag, setNewTag] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[code], values ?? { max: 20000 }), tone: "error" });
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  // Keys: r a reply, n a note, e close (the ? sheet lists them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy(e) || !canAnswer) return;
      if (e.key === "r" || e.key === "n") {
        e.preventDefault();
        setMode(e.key === "r" ? "reply" : "note");
        field.current?.focus();
      } else if (e.key === "e" && canManage && ticket.status !== "closed" && ticket.status !== "spam") {
        e.preventDefault();
        closeIt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function mergeIt(into: number) {
    start(async () => {
      const r = await merge(ticket.number, into);
      if (!r.ok) return fail(r.error, r.values);
      const before = r.value.status;
      toast({
        id: `merge-${ticket.number}`,
        text: format(w.mergedToast, { number: into }),
        undo: async () => {
          const back = await unmerge(ticket.number, before);
          if (!back.ok) return t.errors[back.error];
          router.push(`/chest/tickets/${ticket.number}`);
          return true;
        },
      });
      router.push(`/chest/tickets/${into}`);
    });
  }

  function send(close: boolean) {
    const body = text.trim();
    if (!body) return field.current?.focus();
    if (filesPending(files)) return void toast(t.files.wait);
    const attached = files.filter(f => f.ref).map(f => ({ ref: f.ref!, name: f.name }));
    setSending(true);
    start(async () => {
      const result = mode === "reply" ? await reply(ticket.number, body, close, attached) : await note(ticket.number, body, attached);
      setSending(false);
      if (!result.ok) return fail(result.error, result.values);
      setText("");
      setFiles([]);
      if (mode === "note") return void toast(w.noteToast);
      // The answer left (by email, or on the customer's page): never an Undo.
      const delivery = (result.value as { delivery?: string } | null)?.delivery;
      toast({ id: `reply-${ticket.number}`, text: delivery === "colleague" ? w.sentColleagueToast : close ? w.sentClosedToast : delivery === "page" ? w.viaPage : w.sentToast, sent: true });
    });
  }
  type Step = () => Promise<{ ok: true } | { ok: false; error: keyof Catalogue["errors"] }>;
  // An act on the ticket, and — when one is given — a toast whose Undo
  // says whether it worked.
  const act = (step: Step, done?: string, undo?: Step) =>
    start(async () => {
      const r = await step();
      if (!r.ok) return fail(r.error);
      if (done) toast({ id: `ticket-${ticket.number}`, text: done, ...(undo ? { undo: async () => { const back = await undo(); return back.ok || t.errors[back.error]; } } : {}) });
    });
  const closeIt = () => act(() => setStatus(ticket.number, "closed"), w.closedToast, () => setStatus(ticket.number, ticket.status));
  function changePriority(value: Priority) {
    start(async () => {
      showPriority(value);
      const r = await setPriority(ticket.number, value);
      if (!r.ok) return fail(r.error);
      toast({ id: `priority-${ticket.number}`, text: format(w.priorityToast, { priority: t.priority[value] }) });
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
    setText(current => (current.trim() ? current.replace(/\s*$/u, "\n\n") + body : body));
    requestAnimationFrame(() => field.current?.focus());
  }

  const statusChip = <StateBadge status={ticket.status} label={w.statuses[ticket.status]} />;
  return (
    <div className="ticket">
      <div>
        <div className="ticket-head">
          <Link className="back" href="/chest"><Back />{w.back}</Link>
          <h1>{ticket.subject}</h1>
          <p className="row muted small"><span>#{ticket.number}</span>{statusChip}<PriorityChip priority={priority} label={t.priority[priority]} />{ticket.waiting && <Waiting {...ticket.waiting} />}<span>{w.channel[ticket.channel]}</span><span>{ticket.created}</span></p>
          {ticket.source && <p className="small muted">{ticket.source.href ? <a href={ticket.source.href} target="_blank" rel="noopener" title={w.fromFormLink}>{format(w.fromForm, { form: ticket.source.form })}</a> : format(w.fromForm, { form: ticket.source.form })}</p>}
          {viewing.length > 0 && <p className="viewing" role="status"><Eye />{format(viewing.length > 1 ? w.viewingMany : w.viewing, { names: viewing.join(", ") })}</p>}
        </div>
        {ticket.bounce && (
          <div className="notice danger" role="alert"><Alert /><div className="stack tight"><strong>{format(w.bounceBanner, { email: ticket.customerEmail })}</strong>{ticket.bounce.reason && <span className="small muted">{ticket.bounce.reason}</span>}<span className="small">{w.bounceHint}</span></div></div>
        )}
        <ol className="thread">
          {messages.map(m => m.kind === "event" ? (
            <li key={m.id} className="event"><span>{m.event ?? m.body}</span> <time dateTime={m.date} title={m.date}>{m.when}</time></li>
          ) : (
            <li key={m.id} className={`msg ${m.kind === "customer" ? "" : "team"} ${m.kind === "note" ? "note" : ""} ${m.auto ? "auto" : ""}`}>
              <Avatar name={m.who} photo={m.photo} />
              <div className="bubble">
                <div className="who">{m.who}{m.kind === "note" && <span className="chip note-chip">{w.noteTag}</span>}{m.auto && <span className="chip" title={w.autoHint}>{w.auto}</span>}<time dateTime={m.date} title={m.date}>{m.when}</time></div>
                {m.typedBy && <p className="small muted">{m.typedBy}</p>}
                {m.fromOther && m.who !== m.fromOther && <p className="small muted">{m.fromOther}</p>}
                <MessageBody text={m.body} html={m.html} email={m.email} t={w} />
                {m.attachments.some(a => a.image) && (
                  <div className="thumbs">
                    {m.attachments.filter(a => a.image).map(a => <a key={a.id} href={`/chest/files/${a.id}`} target="_blank" rel="noopener"><img src={`/chest/files/${a.id}?thumbnail=1`} alt={format(w.image, { name: a.fileName })} loading="lazy" /></a>)}
                  </div>
                )}
                {m.attachments.length > 0 && (
                  <div className="files" aria-label={w.files}>
                    {m.attachments.map(a => <a key={a.id} href={`/chest/files/${a.id}`} target="_blank" rel="noopener"><Clip />{a.fileName}<span className="size">{a.size}</span></a>)}
                  </div>
                )}
                {m.dropped.length > 0 && <ul className="dropped small muted">{m.dropped.map(d => <li key={d}>{d}</li>)}</ul>}
                {m.original && <p className="delivery"><a href={`/chest/messages/${m.id}/original`}><Download />{w.original}</a></p>}
                {m.kind === "reply" && m.bounce && <p className="delivery bounced"><Alert />{m.bounce}</p>}
                {m.kind === "reply" && !m.bounce && m.delivery && <p className="delivery">{m.delivery === "email" ? <><Mail />{w.viaEmail}</> : ticket.requester ? <><Check /><span title={w.colleagueHint}>{w.viaColleague}</span></> : <><Globe /><span title={w.viaPageHint}>{w.viaPage}</span></>}</p>}
              </div>
            </li>
          ))}
        </ol>
        {canAnswer ? (
          <form className={`composer${mode === "note" ? " is-note" : ""}`} onSubmit={e => { e.preventDefault(); send(false); }}>
            <Tabs label={w.answerAs} current={mode} onChange={id => setMode(id as "reply" | "note")} items={[{ id: "reply", label: w.reply }, { id: "note", label: w.note }]}>
              <label htmlFor="answer" className="visually-hidden">{mode === "reply" ? w.reply : w.note}</label>
              <textarea id="answer" ref={field} value={text} maxLength={20000} placeholder={mode === "reply" ? w.replyPlaceholder : w.notePlaceholder}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(false); } }} />
              <div className="attach"><Attachments files={files} setFiles={setFiles} grant={fileUpload} kind="team" label={w.files} t={{ files: t.files, errors: t.errors }} /></div>
              <div className="actions">
                {mode === "reply" ? (
                  <>
                    <button type="submit" className="ck-button" disabled={sending || !text.trim()}><Send />{w.send}</button>
                    <button type="button" className="ck-button ck-button-quiet" disabled={sending || !text.trim()} onClick={() => send(true)}><Check />{w.sendClose}</button>
                  </>
                ) : <button type="submit" className="ck-button" disabled={sending || !text.trim()}><Note />{w.addNote}</button>}
                <span className="spacer" />
                {/* The saved replies: the kit's menu, each reply with the start
                    of its text under its title, to choose at a glance. */}
                <Menu label={w.saved} showLabel icon={<Quote />} items={replies.length === 0
                  ? [{ id: "none", label: w.noSaved, disabled: true }]
                  : replies.map(r => ({ id: r.id, label: r.title, note: opening(r.filled), onSelect: () => insert(r.filled) }))} />
              </div>
            </Tabs>
          </form>
        ) : <p className="notice">{w.cannotAnswer}</p>}
      </div>

      <aside className="side-card" aria-label={w.customer}>
        <div className="fact">
          <p className="label">{w.from}</p>
          {ticket.requester ? (
            <>
              <p className="row"><strong>{ticket.requester}</strong></p>
              <p className="small muted">{w.colleagueHint}</p>
            </>
          ) : editing ? (
            <form className="stack" onSubmit={e => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              start(async () => {
                const r = await setCustomer(ticket.number, String(d.get("email") ?? ""), String(d.get("name") ?? ""));
                if (!r.ok) return fail(r.error, r.values);
                setEditing(false);
                toast({ id: `customer-${ticket.number}`, text: w.customerSaved });
              });
            }}>
              <div><label className="label small" htmlFor="customer-email">{w.customerEmail}</label><input id="customer-email" name="email" type="email" className="field" defaultValue={ticket.customerEmail} required maxLength={254} /></div>
              <div><label className="label small" htmlFor="customer-name">{w.customerName}</label><input id="customer-name" name="name" className="field" defaultValue={ticket.customerName} maxLength={120} /></div>
              <div className="row"><button type="submit" className="ck-button ck-button-small">{w.saveCustomer}</button><button type="button" className="link-button" onClick={() => setEditing(false)}>{w.cancel}</button></div>
            </form>
          ) : (
            <>
              <p className="row"><strong>{ticket.customerName || ticket.customerEmail}</strong>{canManage && <button type="button" className="link-button" onClick={() => setEditing(true)}>{w.editCustomer}</button>}</p>
              {ticket.customerName && <p className="small"><a href={`mailto:${ticket.customerEmail}`}>{ticket.customerEmail}</a></p>}
            </>
          )}
          {ticket.rating && <p className="small">{ticket.rating === "good" ? w.ratedGood : w.ratedBad}</p>}
        </div>
        <div className="fact">
          {canManage ? <p className="label" aria-hidden="true">{w.assignee}</p> : <p className="label">{w.assignee}</p>}
          {canManage ? (
            <div className="stack tight">
              <PeoplePicker id="assignee" label={w.assignee} hideLabel clearable value={team.filter(p => p.id === ticket.assignee)} search={localSearch(team)}
                suggestions={[...team.filter(p => p.id === me), ...team.filter(p => p.id !== me)].slice(0, 8)} suggestionsLabel={w.team}
                onChange={chosen => act(() => assign(ticket.number, chosen[0]?.id ?? null))} labels={{ ...t.peoplePicker, placeholder: w.nobody }} lang={locale} />
              <div className="row">
                {ticket.assignee !== me && canAnswer && <button type="button" className="link-button" onClick={() => act(() => assign(ticket.number, me))}>{w.takeIt}</button>}
              </div>
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
              <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={!newTag.trim()}>{w.addTag}</button>
            </form>
          )}
        </div>
        <div className="fact">
          <p className="label">{w.status}</p>
          <div className="row">
            {statusChip}
            {canManage && (ticket.status === "closed" || ticket.status === "spam"
              ? <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={() => act(() => setStatus(ticket.number, "open"))}>{ticket.status === "spam" ? w.notSpam : w.reopen}</button>
              : <>
                  <button type="button" className="ck-button ck-button-quiet ck-button-small" onClick={closeIt}><Check />{w.close}</button>
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
        {canManage && ticket.status !== "spam" && (
          <details className="fact merge">
            <summary className="link-button">{w.merge}</summary>
            <form className="stack" onSubmit={e => { e.preventDefault(); const n = Number(mergeInto.replace(/^#/u, "")); if (n > 0) mergeIt(n); }}>
              <label className="label small" htmlFor="merge-into">{w.mergeLabel}</label>
              <div className="row add-tag">
                <input id="merge-into" className="field" inputMode="numeric" list="merge-numbers" value={mergeInto} onChange={e => setMergeInto(e.target.value)} maxLength={10} aria-describedby="merge-hint" />
                <datalist id="merge-numbers">{others.filter(o => o.status !== "spam").map(o => <option key={o.number} value={o.number}>{o.subject}</option>)}</datalist>
                <button type="submit" className="ck-button ck-button-quiet ck-button-small" disabled={!/^#?[1-9][0-9]{0,8}$/u.test(mergeInto.trim())}>{w.mergeButton}</button>
              </div>
              <p id="merge-hint" className="hint">{w.mergeHint}</p>
            </form>
          </details>
        )}
      </aside>
    </div>
  );
}

// A message's words: the text, links clickable, an email's quoted history
// folded; "Show formatting" shows the HTML the Chest cleaned (allowed tags
// only, no script, style or image — and the tool's policy runs no script
// anyway).
function MessageBody({ text, html, email, t }: { text: string; html: string | null; email: boolean; t: Words["ticket"] }) {
  const [formatted, setFormatted] = useState(false);
  return (
    <>
      {formatted && html ? <div className="body html" dangerouslySetInnerHTML={{ __html: html }} /> : <Body text={text} {...(email ? { quotedLabel: t.quoted } : {})} />}
      {html && <button type="button" className="link-button small" aria-pressed={formatted} onClick={() => setFormatted(f => !f)}>{formatted ? t.plain : t.formatted}</button>}
    </>
  );
}

// The start of a saved reply, on one line: enough to tell it from the others.
function opening(text: string): string {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length > 90 ? line.slice(0, 89).trimEnd() + "…" : line;
}
