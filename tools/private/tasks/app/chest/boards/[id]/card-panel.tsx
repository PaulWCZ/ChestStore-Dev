"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Avatar } from "../../../../components/avatar.tsx";
import { Archive, Calendar, Chat, CheckList, Clip, Clock, Close, Download, File, People, Plus, Restore, Tag, Text, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Column, Label } from "../../../../lib/boards.ts";
import type { Activity, Attachment, CardDetail, Comment } from "../../../../lib/cards.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { Color } from "../../../../lib/model.ts";
import {
  addComment, addItem, addLabel, archiveCard, deleteCard, detach, editComment, moveCard, removeComment, removeItem, setAssignees, setLabel, updateCard, updateItem,
} from "../../actions.ts";

export type PanelCard = Omit<CardDetail, "thread" | "history" | "files"> & {
  access: string;
  createdWhen: string;
  dueLabel: string | null;
  thread: (Comment & { when: string; date: string })[];
  history: (Activity & { when: string })[];
  files: (Attachment & { when: string })[];
};
type Words = { card: Catalogue["card"]; activity: Catalogue["activity"]; errors: Catalogue["errors"]; colors: Catalogue["colors"] };
type People = Record<string, { name: string; photo: string | null }>;
type Person = { id: string; name: string; photo: string | null };
type Props = {
  card: PanelCard;
  board: { id: string; color: string; archived: boolean; writable: boolean };
  columns: Column[];
  labels: Label[];
  people: People;
  audience: Person[];
  me: string;
  t: Words;
};
const labelColors: Color[] = ["sun", "tomato", "berry", "grape", "sky", "sea", "leaf", "sand", "slate"];

// A card, in full, beside the board. Each change is saved at once; the
// page refreshes itself from the server after it.
export function CardPanel({ card, board, columns, labels, people, audience, me, t }: Props) {
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [, start] = useTransition();
  const writable = board.writable && !card.archived;
  const canComment = card.access !== "read" && !board.archived;
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("card");
    router.push(`${path}${params.size ? "?" + params.toString() : ""}`, { scroll: false });
  };
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"]; values?: Record<string, string | number> }>, after?: () => void) =>
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) toast(format(t.errors[r.error], r.values));
      else after?.();
    });
  const nameOf = (id: string) => people[id]?.name ?? audience.find(p => p.id === id)?.name ?? t.card.nobody;

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <div className={`panel c-${board.color}`} role="dialog" aria-modal="true" aria-labelledby="card-title" tabIndex={-1} ref={panel}>
        <div className="panel-head">
          <TitleField card={card} writable={writable} t={t} onSave={title => run(() => updateCard(card.id, { title }))} />
          <button type="button" className="icon-button" onClick={close}><Close /><span className="visually-hidden">{t.card.close}</span></button>
        </div>
        <div className="panel-body">
          {card.archived && (
            <div className="archived-banner">
              <Archive /><span>{t.card.archived}</span>
              {board.writable && (
                <>
                  <button type="button" className="button small quiet" onClick={() => run(() => archiveCard(card.id, false))}><Restore />{t.card.restore}</button>
                  <button type="button" className="button small danger" onClick={() => run(() => deleteCard(card.id), close)}><Trash />{t.card.deleteForever}</button>
                </>
              )}
            </div>
          )}

          <div className="facts">
            <div className="fact">
              <label className="label" htmlFor="card-column">{t.card.column}</label>
              {writable ? (
                <select id="card-column" className="select" value={card.columnId} onChange={e => run(() => moveCard(card.id, e.target.value, null, null))}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : <span>{columns.find(c => c.id === card.columnId)?.name}{card.done && <> · <span className="chip done">{t.card.doneBadge}</span></>}</span>}
            </div>
            <div className="fact">
              <label className="label" htmlFor="card-due"><Calendar /> {t.card.due}</label>
              {writable ? (
                <div className="row">
                  <input id="card-due" type="date" className="field" defaultValue={card.due ?? ""} key={card.due ?? "none"} onChange={e => run(() => updateCard(card.id, { due: e.target.value || null }))} />
                  {card.due && <button type="button" className="link-button" onClick={() => run(() => updateCard(card.id, { due: null }))}>{t.card.removeDue}</button>}
                </div>
              ) : <span>{card.dueLabel ?? t.card.noDue}</span>}
            </div>
          </div>

          <Section icon={<People />} title={t.card.assignees}>
            <Assignees card={card} audience={audience} people={people} writable={writable} me={me} t={t} onSave={ids => run(() => setAssignees(card.id, ids))} />
          </Section>

          <Section icon={<Tag />} title={t.card.labels}>
            <Labels card={card} labels={labels} writable={writable} t={t}
              onToggle={(id, on) => run(() => setLabel(card.id, id, on))}
              onCreate={(name, color) => run(async () => { const r = await addLabel(board.id, { name, color }); if (r.ok) await setLabel(card.id, r.value.id, true); return r; })} />
          </Section>

          <Section icon={<Text />} title={t.card.description}>
            <Description card={card} writable={writable} t={t} onSave={description => run(() => updateCard(card.id, { description }))} />
          </Section>

          <Section icon={<CheckList />} title={t.card.checklist}>
            <Checklist card={card} writable={writable} t={t}
              onAdd={text => run(() => addItem(card.id, text))}
              onToggle={(id, done) => run(() => updateItem(id, { done }))}
              onRemove={id => run(() => removeItem(id))} />
          </Section>

          <Section icon={<Clip />} title={t.card.files}>
            <Files card={card} writable={writable} people={people} t={t} onRemove={id => run(() => detach(id))} onError={code => toast(format(t.errors[code], {}))} onDone={() => router.refresh()} />
          </Section>

          <Section icon={<Chat />} title={t.card.comments}>
            <Thread card={card} people={people} audience={audience} me={me} canComment={canComment} canModerate={card.access === "own"} t={t}
              onAdd={(body, mentions) => run(() => addComment(card.id, body, mentions))}
              onEdit={(id, body) => run(() => editComment(id, body))}
              onRemove={id => run(() => removeComment(id))} />
          </Section>

          <Section icon={<Clock />} title={t.card.history}>
            <ul className="history">
              {card.history.map(h => <li key={h.id}><time>{h.when}</time><span>{describe(h, nameOf, columns, t)}</span></li>)}
            </ul>
            <p className="hint">{format(t.card.createdBy, { name: nameOf(card.createdBy), when: card.createdWhen })}</p>
          </Section>

          {writable && (
            <div className="panel-foot">
              <button type="button" className="button quiet" onClick={() => run(() => archiveCard(card.id, true), () => { close(); toast(t.card.archivedToast, { label: t.card.undo, run: () => start(async () => { await archiveCard(card.id, false); }) }); })}><Archive />{t.card.archive}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="panel-section"><h2>{icon}{title}</h2>{children}</section>;
}

function describe(h: Activity, nameOf: (id: string) => string, columns: Column[], t: Words): string {
  const words = t.activity as Record<string, string>;
  const text = words[h.kind] ?? h.kind;
  const column = (id: unknown) => columns.find(c => c.id === String(id))?.name ?? t.activity.unknownColumn;
  return format(text, {
    name: nameOf(h.actor),
    person: nameOf(String(h.data["member"] ?? "erased")),
    to: String(h.data["to"] ?? ""),
    due: String(h.data["due"] ?? ""),
    column: column(h.data["to"]),
    file: String(h.data["file"] ?? ""),
  });
}

function TitleField({ card, writable, t, onSave }: { card: PanelCard; writable: boolean; t: Words; onSave: (title: string) => void }) {
  const [value, setValue] = useState(card.title);
  useEffect(() => setValue(card.title), [card.title]);
  const save = () => {
    const text = value.replace(/\s+/gu, " ").trim();
    if (text && text !== card.title) onSave(text);
    else setValue(card.title);
  };
  return (
    <>
      <label htmlFor="card-title" className="visually-hidden">{t.card.title}</label>
      <textarea id="card-title" value={value} readOnly={!writable} maxLength={300} rows={1}
        onChange={e => setValue(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { setValue(card.title); e.currentTarget.blur(); } }} />
    </>
  );
}

function Assignees({ card, audience, people, writable, me, t, onSave }: { card: PanelCard; audience: Person[]; people: People; writable: boolean; me: string; t: Words; onSave: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState(card.assignees);
  useEffect(() => setChosen(card.assignees), [card.assignees]);
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  const list = [...audience].sort((a, b) => Number(b.id === me) - Number(a.id === me)).filter(p => fold(p.name).includes(fold(q)));
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
    setChosen(next);
    onSave(next);
  };
  return (
    <div className="picker">
      <div className="people-line">
        {chosen.length === 0 && <span className="muted">{t.card.nobody}</span>}
        {chosen.map(id => <span key={id} className="person"><Avatar name={people[id]?.name ?? audience.find(p => p.id === id)?.name ?? "?"} photo={people[id]?.photo ?? audience.find(p => p.id === id)?.photo ?? null} size={24} />{people[id]?.name ?? audience.find(p => p.id === id)?.name}</span>)}
        {writable && <button type="button" className="button small quiet" aria-expanded={open} onClick={() => setOpen(!open)}><Plus />{t.card.assign}</button>}
      </div>
      {open && (
        <div className="picker-pop" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
          <label className="visually-hidden" htmlFor="assign-search">{t.card.assignSearch}</label>
          <input id="assign-search" className="field" placeholder={t.card.assignSearch} value={q} onChange={e => setQ(e.target.value)} autoFocus />
          <div className="picker-list">
            {list.map(p => (
              <label key={p.id}>
                <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(p.id)} />
                <Avatar name={p.name} photo={p.photo} size={24} />{p.name}
              </label>
            ))}
          </div>
          <button type="button" className="button small" onClick={() => setOpen(false)}>{t.card.close}</button>
        </div>
      )}
    </div>
  );
}

function Labels({ card, labels, writable, t, onToggle, onCreate }: { card: PanelCard; labels: Label[]; writable: boolean; t: Words; onToggle: (id: string, on: boolean) => void; onCreate: (name: string, color: Color) => void }) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(card.labels);
  useEffect(() => setOn(card.labels), [card.labels]);
  const [color, setColor] = useState<Color>("sky");
  const current = labels.filter(l => on.includes(l.id));
  return (
    <div className="picker">
      <div className="people-line">
        {current.map(l => <span key={l.id} className={`chip label-chip c-${l.color}`}>{l.name || t.colors[l.color]}</span>)}
        {writable && <button type="button" className="button small quiet" aria-expanded={open} onClick={() => setOpen(!open)}><Plus />{t.card.labels}</button>}
      </div>
      {open && (
        <div className="picker-pop" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
          <div className="picker-list">
            {labels.map(l => (
              <label key={l.id}>
                <input type="checkbox" checked={on.includes(l.id)} onChange={e => { setOn(e.target.checked ? [...on, l.id] : on.filter(x => x !== l.id)); onToggle(l.id, e.target.checked); }} />
                <span className={`chip label-chip c-${l.color}`}>{l.name || t.colors[l.color]}</span>
              </label>
            ))}
          </div>
          <form className="stack" onSubmit={e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name") ?? "").trim(); onCreate(name, color); e.currentTarget.reset(); }}>
            <label className="label" htmlFor="label-name">{t.card.newLabel}</label>
            <input id="label-name" name="name" className="field" maxLength={40} placeholder={t.card.labelName} />
            <div className="swatches" role="radiogroup" aria-label={t.card.labels}>
              {labelColors.map(c => (
                <label key={c} className={`swatch c-${c}`} style={{ background: `var(--${c})` }} title={t.colors[c]}>
                  <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={t.colors[c]} />
                </label>
              ))}
            </div>
            <div className="row">
              <button type="submit" className="button small">{t.card.newLabel}</button>
              <button type="button" className="link-button" onClick={() => setOpen(false)}>{t.card.close}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Description({ card, writable, t, onSave }: { card: PanelCard; writable: boolean; t: Words; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(card.description);
  useEffect(() => { if (!editing) setValue(card.description); }, [card.description, editing]);
  if (!editing) {
    return (
      <div className={`description${card.description ? "" : " empty-text"}`} onClick={() => writable && setEditing(true)} role={writable ? "button" : undefined} tabIndex={writable ? 0 : undefined} onKeyDown={e => { if (writable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setEditing(true); } }}>
        {card.description ? <Linkified text={card.description} /> : writable ? t.card.descriptionPlaceholder : ""}
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); onSave(value); setEditing(false); }}>
      <label htmlFor="card-description" className="visually-hidden">{t.card.description}</label>
      <textarea id="card-description" className="field" rows={6} maxLength={20000} value={value} autoFocus placeholder={t.card.descriptionPlaceholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} />
      <div className="row">
        <button type="submit" className="button small">{t.card.save}</button>
        <button type="button" className="link-button" onClick={() => setEditing(false)}>{t.card.cancel}</button>
      </div>
    </form>
  );
}

// Links in a text become links (http and https only); everything else stays
// text — React escapes it.
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gu);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()}>{part}</a> : part))}</>;
}

function Checklist({ card, writable, t, onAdd, onToggle, onRemove }: { card: PanelCard; writable: boolean; t: Words; onAdd: (text: string) => void; onToggle: (id: string, done: boolean) => void; onRemove: (id: string) => void }) {
  const [items, setItems] = useState(card.items);
  useEffect(() => setItems(card.items), [card.items]);
  const done = items.filter(i => i.done).length;
  return (
    <div className="stack">
      {items.length > 0 && (
        <>
          <div className="row"><span className="small muted">{format(t.card.progress, { done, total: items.length })}</span></div>
          <div className="progress" role="presentation"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
        </>
      )}
      <ul className="checklist">
        {items.map(item => (
          <li key={item.id} className={`check-item${item.done ? " done" : ""}`}>
            <input type="checkbox" id={`item-${item.id}`} checked={item.done} disabled={!writable}
              onChange={e => { setItems(items.map(i => (i.id === item.id ? { ...i, done: e.target.checked } : i))); onToggle(item.id, e.target.checked); }} />
            <label htmlFor={`item-${item.id}`} style={{ flex: 1 }}><span>{item.text}</span></label>
            {writable && <button type="button" className="icon-button" onClick={() => { setItems(items.filter(i => i.id !== item.id)); onRemove(item.id); }}><Close /><span className="visually-hidden">{format(t.card.removeItem, { text: item.text })}</span></button>}
          </li>
        ))}
      </ul>
      {writable && (
        <form className="row" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const text = String(new FormData(form).get("item") ?? "").trim(); if (!text) return; onAdd(text); form.reset(); }}>
          <label htmlFor="new-item" className="visually-hidden">{t.card.addItem}</label>
          <input id="new-item" name="item" className="field" style={{ flex: 1 }} maxLength={300} placeholder={t.card.itemPlaceholder} />
          <button type="submit" className="button small quiet"><Plus />{t.card.addItem}</button>
        </form>
      )}
    </div>
  );
}

// Files go from the browser to the Chest itself: the tool authorises one
// upload, the browser sends it, the tool checks it arrived and records it.
function Files({ card, writable, people, t, onRemove, onError, onDone }: { card: PanelCard; writable: boolean; people: People; t: Words; onRemove: (id: string) => void; onError: (code: keyof Catalogue["errors"]) => void; onDone: () => void }) {
  const [sending, setSending] = useState<string | null>(null);
  async function send(file: File) {
    if (file.size > 25 << 20) return onError("file_too_large");
    setSending(file.name);
    try {
      const grant = await fetch(`/chest/api/cards/${card.id}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: file.size, type: file.type || "application/octet-stream" }) });
      const up = await grant.json() as { url?: string; error?: keyof Catalogue["errors"] };
      if (!grant.ok || !up.url) return onError(up.error ?? "unknown");
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) return onError(put.status === 413 ? "file_too_large" : "file_missing");
      const { name } = await put.json() as { name: string };
      const confirm = await fetch(`/chest/api/cards/${card.id}/upload`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, fileName: file.name }) });
      if (!confirm.ok) return onError(((await confirm.json()) as { error?: keyof Catalogue["errors"] }).error ?? "file_missing");
      onDone();
    } catch {
      onError("unavailable");
    } finally {
      setSending(null);
    }
  }
  return (
    <div className="stack">
      <ul className="files">
        {card.files.map(f => (
          <li key={f.id} className="file">
            <File />
            <a href={`/chest/files/${f.id}`} target="_blank" rel="noopener">{f.fileName}</a>
            <span className="small muted">{people[f.addedBy]?.name} · {f.when}</span>
            <a className="icon-button" href={`/chest/files/${f.id}?download=1`}><Download /><span className="visually-hidden">{t.card.download}</span></a>
            {writable && <button type="button" className="link-button danger" onClick={() => onRemove(f.id)}>{t.card.removeFile}</button>}
          </li>
        ))}
      </ul>
      {sending && <p className="hint" role="status">{format(t.card.uploading, { name: sending })}</p>}
      {writable && (
        <label className="button small quiet file-input" style={{ width: "fit-content" }}>
          <Plus />{t.card.addFile}
          <input type="file" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
        </label>
      )}
    </div>
  );
}

function Thread({ card, people, audience, me, canComment, canModerate, t, onAdd, onEdit, onRemove }: {
  card: PanelCard; people: People; audience: Person[]; me: string; canComment: boolean; canModerate: boolean; t: Words;
  onAdd: (body: string, mentions: string[]) => void; onEdit: (id: string, body: string) => void; onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const mentionable = audience.filter(p => p.id !== me);
  return (
    <div className="stack">
      {canComment && <Composer people={mentionable} t={t} onSubmit={onAdd} />}
      <ul className="thread">
        {[...card.thread].reverse().map(c => {
          const author = c.importedAuthor ? format(t.card.imported, { name: c.importedAuthor }) : people[c.author]?.name ?? "?";
          return (
            <li key={c.id} className="comment">
              <Avatar name={author} photo={c.importedAuthor ? null : people[c.author]?.photo ?? null} />
              <div className="bubble">
                <div className="who">{author} <time title={c.date}>{c.when}</time>{c.edited && <span className="muted">· {t.card.edited}</span>}</div>
                {editing === c.id ? (
                  <form className="stack" onSubmit={e => { e.preventDefault(); onEdit(c.id, String(new FormData(e.currentTarget).get("body") ?? "")); setEditing(null); }}>
                    <textarea name="body" className="field" defaultValue={c.body} rows={3} maxLength={5000} autoFocus aria-label={t.card.edit} />
                    <div className="row"><button type="submit" className="button small">{t.card.save}</button><button type="button" className="link-button" onClick={() => setEditing(null)}>{t.card.cancel}</button></div>
                  </form>
                ) : <p><Mentions text={c.body} names={Object.values(people).map(p => p.name).concat(audience.map(p => p.name))} /></p>}
                {editing !== c.id && (c.author === me || canModerate) && (
                  <div className="row">
                    {c.author === me && <button type="button" className="link-button" onClick={() => setEditing(c.id)}>{t.card.edit}</button>}
                    <button type="button" className="link-button danger" onClick={() => onRemove(c.id)}>{t.card.delete}</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// @Name in a comment, highlighted when it names someone.
function Mentions({ text, names }: { text: string; names: string[] }) {
  const known = [...new Set(names)].filter(n => n.length > 1).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  if (known.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(@(?:${known.join("|")}))`, "gu"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="mention">{p}</span> : p))}</>;
}

// The comment field: typing "@" and letters proposes the people of the
// board; the chosen ones are sent with the comment (and told).
function Composer({ people, t, onSubmit }: { people: Person[]; t: Words; onSubmit: (body: string, mentions: string[]) => void }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Person[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  const suggestions = query === null ? [] : people.filter(p => fold(p.name).split(" ").some(w => w.startsWith(fold(query))) || fold(p.name).startsWith(fold(query))).slice(0, 6);
  function onChange(value: string, caret: number) {
    setText(value);
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([\p{L}\p{N}' -]{0,30})$/u.exec(before);
    setQuery(m ? m[1]! : null);
    setActive(0);
  }
  function pick(p: Person) {
    const el = field.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}' -]{0,30})$/u, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setChosen(c => (c.some(x => x.id === p.id) ? c : [...c, p]));
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }
  function submit() {
    const body = text.trim();
    if (!body) return;
    onSubmit(body, chosen.filter(p => body.includes("@" + p.name)).map(p => p.id));
    setText("");
    setChosen([]);
  }
  return (
    <form className="composer" onSubmit={e => { e.preventDefault(); submit(); }}>
      <label htmlFor="comment" className="visually-hidden">{t.card.commentPlaceholder}</label>
      <textarea ref={field} id="comment" className="field" rows={2} maxLength={5000} value={text} placeholder={t.card.commentPlaceholder}
        aria-autocomplete="list" aria-controls={suggestions.length > 0 ? "mention-list" : undefined} aria-activedescendant={suggestions.length > 0 ? `mention-${active}` : undefined}
        onChange={e => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={e => {
          if (suggestions.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % suggestions.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((active - 1 + suggestions.length) % suggestions.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(suggestions[active]!); return; }
            if (e.key === "Escape") { e.stopPropagation(); setQuery(null); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        }} />
      {suggestions.length > 0 && (
        <div className="suggestions" id="mention-list" role="listbox" aria-label={t.card.mention}>
          {suggestions.map((p, i) => (
            <button type="button" key={p.id} id={`mention-${i}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(p); }}>
              <Avatar name={p.name} photo={p.photo} size={24} />{p.name}
            </button>
          ))}
        </div>
      )}
      <div className="row"><button type="submit" className="button small" disabled={!text.trim()}>{t.card.comment}</button></div>
    </form>
  );
}
