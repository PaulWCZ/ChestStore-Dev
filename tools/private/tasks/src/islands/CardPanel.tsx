import { Avatar, Confirm, DateField, Dialog, FilePicker, PeoplePicker, TimeSelect, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { localSearch, parseTime, putWithProgress, searchChoices, timeText, type Choice } from "@argentic/chest-ui/components/logic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Archive, Blocked, Chat, Check, CheckList, Clip, Clock, Close, Copy, Dots, Download, Fields, File, MoveTo, People, Plus, RepeatIcon, Restore, Tag, Text, Trash } from "../components/icons.tsx";
import { Markdown } from "../components/markdown.tsx";
import { call, navigate, onLinkClick, refresh, toast } from "@argentic/chest-app/client";
import type { Outcome } from "@argentic/chest-app";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Column, Field, Label } from "../lib/boards.ts";
import type { Attachment, CardDetail, CheckItem, Comment, Link as CardLink } from "../lib/cards.ts";
import type { Color } from "../shared/model.ts";
import { repeatKinds, suggest, type Repeat, type RepeatKind } from "../shared/repeat.ts";

export type PanelItem = CheckItem & { dueLabel: string | null; late: boolean };
// A line of the card's history, its data already written as words (dates in
// the reader's language) on the server.
export type PanelActivity = { id: string; actor: string; kind: string; data: Record<string, string>; when: string };
export type PanelCard = Omit<CardDetail, "thread" | "history" | "files" | "items"> & {
  access: string;
  createdWhen: string;
  dueLabel: string | null;
  startLabel: string | null;
  thread: (Comment & { when: string; date: string })[];
  history: PanelActivity[];
  files: (Attachment & { when: string })[];
  items: PanelItem[];
};
// A board a card may go to, with its columns.
export type Target = { id: string; name: string; columns: { id: string; name: string }[] };
// What the page wrote of the card's repeat (dates and day names are
// written on the server).
export type RepeatView = {
  summary: string | null;
  upcoming: string | null;
  made: { text: string; href: string } | null;
  days: { value: number; short: string; long: string }[];
  today: string;
};
type Words = { card: Catalogue["card"]; activity: Catalogue["activity"]; errors: Pick<Catalogue["errors"], "file_too_large" | "file_missing" | "unavailable">; colors: Catalogue["colors"]; fields: Catalogue["fields"]; dialog: Catalogue["dialog"]; date: Catalogue["date"]; peoplePicker: Catalogue["peoplePicker"]; files: Catalogue["files"] };
type People = Record<string, { name: string; photo: string | null }>;
type Person = { id: string; name: string; photo: string | null };
type Props = {
  // The board's address (/chest/boards/<id>): closing the panel goes back
  // there, with the view and filters of the moment; view: that query
  // without the card (a linked card opens in the same view).
  path: string;
  view: string;
  card: PanelCard;
  board: { id: string; name: string; color: string; archived: boolean; writable: boolean };
  columns: Column[];
  labels: Label[];
  fields: Field[];
  targets: Target[];
  // The other cards of the board it may wait for.
  linkable: { id: string; title: string }[];
  people: People;
  audience: Person[];
  me: string;
  repeat: RepeatView;
  locale: Locale;
  t: Words;
};
// One colour per slot of the theme's palette (app/tokens.css): "sand"
// shares slate's and is not offered.
const labelColors: Color[] = ["sun", "tomato", "berry", "grape", "sky", "sea", "leaf", "slate"];
// A change of the card: sent, then after() once it was taken (a refusal is
// said by call(): a toast in the reader's words).
type Run = (step: () => Promise<Outcome<unknown>>, after?: () => void) => void;

// A card, in full, beside the board. Each change is saved at once; the
// page refreshes itself from the server after it.
export function CardPanel({ path, view, card, board, columns, labels, fields, targets, linkable, people, audience, me, repeat, locale, t }: Props) {
  const [, start] = useTransition();
  const writable = board.writable && !card.archived;
  const canComment = card.access !== "read" && !board.archived;
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("card");
    const opener = card.id;
    void navigate(`${path}${params.size ? "?" + params.toString() : ""}`, { top: false }).then(() => {
      // Back to the card that was opened (on the board, the list, the
      // calendar or the timeline), not the top of the page.
      // The one shown (the list has a table and, on a phone, cards).
      [...document.querySelectorAll<HTMLElement>(`[data-card="${opener}"]`)].find(el => el.offsetParent !== null)?.focus();
    });
  };
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const run: Run = (step, after) =>
    start(async () => {
      const r = await step();
      if (r.ok) after?.();
    });
  // A move undone: back to the column it came from; the toast says if not.
  const moveBack = (from: string) => async () => { const r = await call("moveCard", { id: card.id, column: from }, { quiet: true }); return r.ok || r.message; };
  // The people of the board, as the kit's pickers want them ("You" first).
  const choices = useMemo<Choice[]>(() => [...audience].sort((a, b) => Number(b.id === me) - Number(a.id === me)).map(p => ({ kind: "member" as const, id: p.id, name: p.id === me ? t.card.you : p.name, photo: p.photo })), [audience, me, t.card.you]);
  const [erasing, setErasing] = useState(false);
  const nameOf = (id: string) => people[id]?.name ?? audience.find(p => p.id === id)?.name ?? t.card.nobody;
  const [moving, setMoving] = useState(false);
  // Done in one click: the card goes to the board's first "done" column
  // (and back where it was with "Undo"); a done card reopens in the first
  // column that is not.
  const doneColumn = columns.find(c => c.done);
  const openColumn = columns.find(c => !c.done);
  // A card that waits for open cards is not done unless the person says
  // so: the toast says what it waits for, with "Mark done anyway".
  const toColumn = (columnId: string) => {
    const target = columns.find(c => c.id === columnId);
    if (!target) return;
    const from = card.columnId;
    const moved = () => { if (target.done) toast({ id: `move-${card.id}`, text: format(t.card.doneToast, { column: target.name }), undo: moveBack(from) }); };
    start(async () => {
      const r = await call("moveCard", { id: card.id, column: target.id }, { quiet: true });
      if (r.ok) return moved();
      if (r.error !== "blocked") return void toast({ text: r.message, tone: "error" });
      toast({ id: `move-${card.id}`, text: r.message, tone: "error", action: { label: t.card.doneAnyway, run: () => start(async () => { const again = await call("moveCard", { id: card.id, column: target.id, force: true }); if (again.ok) moved(); }) } });
    });
  };
  const markDone = () => { if (doneColumn) toColumn(doneColumn.id); };

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <div className={`panel c-${board.color}`} role="dialog" aria-modal="true" aria-labelledby="card-title" tabIndex={-1} ref={panel}>
        <div className="panel-head">
          <TitleField card={card} writable={writable} t={t} onSave={title => run(() => call("updateCard", { id: card.id, title }))} onEmpty={() => toast({ text: t.card.titleNeeded })} />
          <button type="button" className="icon-button" onClick={close}><Close /><span className="visually-hidden">{t.card.close}</span></button>
        </div>
        <div className="panel-body">
          {card.archived && (
            <div className="archived-banner">
              <Archive /><span>{t.card.archived}</span>
              {board.writable && (
                <>
                  <button type="button" className="button small quiet" onClick={() => run(() => call("archiveCard", { id: card.id, archived: false }))}><Restore />{t.card.restore}</button>
                  <button type="button" className="button small danger" onClick={() => setErasing(true)}><Trash />{t.card.deleteForever}</button>
                </>
              )}
            </div>
          )}

          {writable && (doneColumn || card.done) && (
            <div className="done-bar">
              {card.done ? (
                <>
                  <span className="chip done big"><Check />{t.card.doneBadge}</span>
                  {openColumn && <button type="button" className="button quiet small" onClick={() => { const from = card.columnId; run(() => call("moveCard", { id: card.id, column: openColumn.id }), () => toast({ id: `move-${card.id}`, text: format(t.card.reopenedToast, { column: openColumn.name }), undo: moveBack(from) })); }}>{t.card.reopen}</button>}
                </>
              ) : <button type="button" className="button done-button" onClick={markDone}><Check />{t.card.markDone}</button>}
              {!card.done && card.waiting > 0 && <span className="chip blocked big"><Blocked />{plural(t.card.blockedCount, card.waiting, locale)}</span>}
            </div>
          )}

          <div className="facts">
            <div className="fact">
              <label className="label" htmlFor="card-column">{t.card.column}</label>
              {writable ? (
                <select id="card-column" className="select" value={card.columnId} onChange={e => toColumn(e.target.value)}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : <span>{columns.find(c => c.id === card.columnId)?.name}{card.done && <> · <span className="chip done">{t.card.doneBadge}</span></>}</span>}
            </div>
            {writable ? (
              // The kit's date fields: typed in the reader's language
              // ("15/10", "demain") or picked on a calendar; the day is
              // written out under the field. Saved when it changes.
              <div className="fact wide due-line">
                <DateField id="card-due" label={t.card.due} value={card.due} today={repeat.today} labels={t.date} onChange={due => run(() => call("updateCard", { id: card.id, due }))} />
                {card.due && (
                  <div className="when">
                    <label className="visually-hidden" htmlFor="card-time">{t.card.dueTime}</label>
                    {/* The kit's 24-hour list, every quarter of an hour, "Any time" first. */}
                    <TimeSelect id="card-time" empty={t.card.anyTime} value={card.dueTime === null ? null : parseTime(card.dueTime)}
                      onChange={m => run(() => call("updateCard", { id: card.id, dueTime: m === null ? null : timeText(m) }))} />
                    <button type="button" className="link-button" onClick={() => run(() => call("updateCard", { id: card.id, due: null }))}>{t.card.removeDue}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="fact wide">
                <span className="label">{t.card.due}</span>
                <span>{card.dueLabel ?? t.card.noDue}</span>
              </div>
            )}
            {writable ? (
              <div className="fact wide due-line">
                <DateField id="card-start" label={t.card.start} value={card.start} today={repeat.today} labels={t.date} chips={false} onChange={start => run(() => call("updateCard", { id: card.id, start }))} />
                {card.start && <div className="when"><button type="button" className="link-button" onClick={() => run(() => call("updateCard", { id: card.id, start: null }))}>{t.card.removeStart}</button></div>}
              </div>
            ) : (
              <div className="fact">
                <span className="label">{t.card.start}</span>
                <span>{card.startLabel ?? t.card.noStart}</span>
              </div>
            )}
          </div>

          <RepeatField card={card} view={repeat} writable={writable} t={t} onSave={rule => run(() => call("setRepeat", rule === null ? { id: card.id } : rule.every === "week" ? { id: card.id, every: "week", days: rule.days } : rule.every === "month" ? { id: card.id, every: "month", day: rule.day } : { id: card.id, every: rule.every }))} />

          <Section icon={<People />} title={t.card.assignees}>
            <Assignees card={card} choices={choices} people={people} writable={writable} locale={locale} t={t} onSave={ids => run(() => call("setAssignees", { id: card.id, people: ids }))} />
          </Section>

          {(writable || card.blockers.length > 0 || card.blocking.length > 0) && (
            <Section icon={<Blocked />} title={t.card.blockedBy}>
              <Blockers path={path} view={view} card={card} linkable={linkable} writable={writable} t={t}
                onAdd={id => run(() => call("addBlocker", { id: card.id, blocker: id }))} onRemove={id => run(() => call("removeBlocker", { id: card.id, blocker: id }))} />
            </Section>
          )}

          <Section icon={<Tag />} title={t.card.labels}>
            <Labels card={card} labels={labels} writable={writable} t={t}
              onToggle={(id, on) => run(() => call("setLabel", { id: card.id, label: id, on }))}
              onCreate={(name, color) => run(() => call("addCardLabel", { id: card.id, name, color }))} />
          </Section>

          {fields.length > 0 && (
            <Section icon={<Fields />} title={t.fields.title}>
              <div className="facts">
                {fields.map(f => <FieldInput key={f.id} field={f} value={card.values[f.id] ?? ""} writable={writable} t={t} onSave={value => run(() => call("setValue", { id: card.id, field: f.id, value }))} />)}
              </div>
            </Section>
          )}

          <Section icon={<Text />} title={t.card.description}>
            <Description card={card} writable={writable} t={t} onSave={description => run(() => call("updateCard", { id: card.id, description }))} />
          </Section>

          <Section icon={<CheckList />} title={t.card.checklist}>
            <Checklists card={card} writable={writable} choices={choices} people={people} me={me} today={repeat.today} locale={locale} t={t} run={run} />
          </Section>

          <Section icon={<Clip />} title={t.card.files}>
            <Files card={card} writable={writable} people={people} t={t} onRemove={id => run(() => call("detach", { id }))} onDone={() => void refresh()} />
          </Section>

          <Section icon={<Chat />} title={t.card.comments}>
            <Thread card={card} people={people} audience={audience} me={me} canComment={canComment} canModerate={card.access === "own"} t={t}
              onAdd={(body, mentions) => run(() => call("addComment", { id: card.id, body, mentions }))}
              onEdit={(id, body) => run(() => call("editComment", { id, body }))}
              onRemove={id => run(() => call("removeComment", { id }), () => toast({ id: `comment-${id}`, text: t.card.commentRemoved, undo: async () => { const r = await call("restoreComment", { id }, { quiet: true }); return r.ok || r.message; } }))} />
          </Section>

          <Section icon={<Clock />} title={t.card.history}>
            <ul className="history">
              {card.history.map(h => <li key={h.id}><time>{h.when}</time><span>{describe(h, nameOf, columns, t)}</span></li>)}
            </ul>
            <p className="hint">{format(t.card.createdBy, { name: nameOf(card.createdBy), when: card.createdWhen })}</p>
          </Section>

          {writable && (
            <div className="panel-foot">
              {targets.length > 0 && <button type="button" className="button quiet" onClick={() => setMoving(true)}><MoveTo />{t.card.moveOrCopy}</button>}
              <button type="button" className="button quiet" onClick={() => run(() => call("archiveCard", { id: card.id, archived: true }), () => { close(); toast({ id: `archive-${card.id}`, text: t.card.archivedToast, undo: async () => { const r = await call("archiveCard", { id: card.id, archived: false }, { quiet: true }); return r.ok || r.message; } }); })}><Archive />{t.card.archive}</button>
            </div>
          )}
        </div>
      </div>
      {moving && <MoveDialog card={card} board={board} targets={targets} t={t} onClose={() => setMoving(false)} />}
      {/* Deleting a card for good cannot be undone: asked first, in the page. */}
      <Confirm open={erasing} title={format(t.card.deleteTitle, { title: card.title })} body={t.card.deleteBody} confirmLabel={t.card.deleteForever} cancelLabel={t.card.cancel}
        onCancel={() => setErasing(false)} onConfirm={() => { setErasing(false); run(() => call("deleteCard", { id: card.id }), close); }} />
    </>
  );
}

// "Move or copy…": a board (this one first), a column; move it there, or
// put a copy there.
function MoveDialog({ card, board, targets, t, onClose }: { card: PanelCard; board: Props["board"]; targets: Target[]; t: Words; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const lanes = targets.find(x => x.id === to)?.columns ?? [];
  const [column, setColumn] = useState(lanes[0]?.id ?? "");
  const choose = (boardId: string) => {
    setTo(boardId);
    const next = targets.find(x => x.id === boardId)?.columns ?? [];
    setColumn(boardId === board.id ? card.columnId : next[0]?.id ?? "");
  };
  const where = targets.find(x => x.id === to)?.name ?? "";
  const go = (copy: boolean) => start(async () => {
    if (copy) {
      const r = await call("duplicateCard", { id: card.id, board: to, column }, { refresh: false });
      if (!r.ok) return;
      onClose();
      toast({ text: t.card.copied });
      await navigate(`/chest/boards/${r.value.boardId}?card=${r.value.id}`);
      return;
    }
    const r = await call("moveToBoard", { id: card.id, board: to, column }, { refresh: false });
    if (!r.ok) return;
    onClose();
    toast({ text: r.value.dropped > 0 ? format(t.card.movedDropped, { board: where, count: r.value.dropped }) : format(t.card.movedTo, { board: where }) });
    await navigate(r.value.boardId !== board.id ? `/chest/boards/${r.value.boardId}?card=${card.id}` : location.href, { replace: r.value.boardId === board.id, top: r.value.boardId !== board.id });
  });
  return (
    <Dialog open title={t.card.moveOrCopy} onClose={onClose} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" disabled={pending || !column} onClick={() => go(true)}><Copy />{t.card.copy}</button>
        <button type="button" className="button" disabled={pending || !column} onClick={() => go(false)}><MoveTo />{t.card.move}</button>
      </>}>
      <div className="stack">
        <div>
          <label className="label" htmlFor="move-board">{t.card.toBoard}</label>
          <select id="move-board" className="select" value={to} onChange={e => choose(e.target.value)}>
            {targets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="move-column">{t.card.toColumn}</label>
          <select id="move-column" className="select" value={column} onChange={e => setColumn(e.target.value)}>
            {lanes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {to !== board.id && <p className="hint">{t.card.moveHint}</p>}
      </div>
    </Dialog>
  );
}

// One of the board's fields: text, a number, one choice. Saved when the
// field is left (a choice at once).
function FieldInput({ field, value, writable, t, onSave }: { field: Field; value: string; writable: boolean; t: Words; onSave: (value: string | null) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const key = `field-${field.id}`;
  if (!writable) return <div className="fact"><span className="label">{field.name}</span><span>{value || "—"}</span></div>;
  return (
    <div className="fact">
      <label className="label" htmlFor={key}>{field.name}</label>
      {field.kind === "choice" ? (
        <select id={key} className="select" value={value} onChange={e => onSave(e.target.value || null)}>
          <option value="">{t.fields.none}</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input id={key} className="field" value={text} inputMode={field.kind === "number" ? "decimal" : undefined} maxLength={500}
          onChange={e => setText(e.target.value)} onBlur={() => { if (text.trim() !== value) onSave(text.trim() || null); }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setText(value); } }} />
      )}
    </div>
  );
}

// Repeat: plain choices; the card then says what repeats and when the next
// one comes. Once the next card is made, this one only points to it.
function RepeatField({ card, view, writable, t, onSave }: { card: PanelCard; view: RepeatView; writable: boolean; t: Words; onSave: (rule: Repeat | null) => void }) {
  const [rule, setRule] = useState<Repeat | null>(card.repeat);
  useEffect(() => setRule(card.repeat), [card.repeat]);
  const change = (next: Repeat | null) => { setRule(next); onSave(next); };
  const editable = writable && !card.next;
  const kind: RepeatKind | "none" = rule?.every ?? "none";
  return (
    <div className="repeat">
      <div className="fact">
        <label className="label" htmlFor="card-repeat"><RepeatIcon /> {t.card.repeat}</label>
        {editable ? (
          <select id="card-repeat" className="select" value={kind} onChange={e => change(e.target.value === "none" ? null : suggest(e.target.value as RepeatKind, card.due ?? view.today))}>
            <option value="none">{t.card.repeatEvery.none}</option>
            {repeatKinds.map(k => <option key={k} value={k}>{t.card.repeatEvery[k]}</option>)}
          </select>
        ) : !rule && <span>{t.card.repeatEvery.none}</span>}
      </div>
      {editable && rule?.every === "week" && (
        <fieldset className="weekdays">
          <legend className="label">{t.card.repeatDays}</legend>
          {view.days.map(d => {
            const on = rule.days.includes(d.value);
            return (
              <label key={d.value} className={`weekday${on ? " on" : ""}`}>
                <input type="checkbox" checked={on} disabled={on && rule.days.length === 1} aria-label={d.long}
                  onChange={() => change({ every: "week", days: on ? rule.days.filter(x => x !== d.value) : [...rule.days, d.value].sort((a, b) => a - b) })} />
                <span aria-hidden="true">{d.short}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      {editable && rule?.every === "month" && (
        <div className="fact">
          <label className="label" htmlFor="repeat-day">{t.card.repeatMonthDay}</label>
          <div className="row">
            <select id="repeat-day" className="select" value={rule.day} onChange={e => change({ every: "month", day: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {rule.day > 28 && <span className="hint">{t.card.repeatShortMonths}</span>}
          </div>
        </div>
      )}
      {(view.summary || view.upcoming || view.made) && (
        <p className="repeat-note" role="status">
          {view.summary && <strong>{view.summary}</strong>} {view.upcoming}{view.made && <>{view.made.text} <a href={view.made.href} onClick={e => onLinkClick(e, { top: false })} className="link-button">{t.card.repeatOpen}</a></>}
        </p>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="panel-section"><h2>{icon}{title}</h2>{children}</section>;
}

function describe(h: PanelActivity, nameOf: (id: string) => string, columns: Column[], t: Words): string {
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
    start: String(h.data["start"] ?? ""),
    step: String(h.data["step"] ?? ""),
    from: String(h.data["from"] ?? ""),
    board: String(h.data["to"] ?? ""),
    title: String(h.data["title"] ?? ""),
    count: String(h.data["count"] ?? ""),
  });
}

function TitleField({ card, writable, t, onSave, onEmpty }: { card: PanelCard; writable: boolean; t: Words; onSave: (title: string) => void; onEmpty: () => void }) {
  const [value, setValue] = useState(card.title);
  useEffect(() => setValue(card.title), [card.title]);
  const save = () => {
    const text = value.replace(/\s+/gu, " ").trim();
    if (!text) onEmpty();
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

// The card's people: the kit's picker (type a name, arrows, Enter; the
// chosen ones as chips, each removable). Saved at once.
function Assignees({ card, choices, people, writable, locale, t, onSave }: { card: PanelCard; choices: Choice[]; people: People; writable: boolean; locale: Locale; t: Words; onSave: (ids: string[]) => void }) {
  const chosenOf = (ids: string[]) => ids.map(id => choices.find(c => c.id === id) ?? { kind: "member" as const, id, name: people[id]?.name ?? t.card.nobody, photo: people[id]?.photo ?? null });
  const [chosen, setChosen] = useState<Choice[]>(() => chosenOf(card.assignees));
  useEffect(() => setChosen(chosenOf(card.assignees)), [card.assignees]); // eslint-disable-line react-hooks/exhaustive-deps
  const search = useMemo(() => localSearch(choices), [choices]);
  if (!writable) {
    return (
      <div className="people-line">
        {chosen.length === 0 && <span className="muted">{t.card.nobody}</span>}
        {chosen.map(p => <span key={p.id} className="person"><Avatar name={p.name} photo={p.photo ?? null} size="s" />{p.name}</span>)}
      </div>
    );
  }
  return (
    <PeoplePicker id="card-assign" label={t.card.assign} multiple value={chosen} search={search} suggestions={choices.slice(0, 12)} labels={t.peoplePicker} lang={locale}
      onChange={next => { setChosen(next); onSave(next.map(p => p.id)); }} />
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
                <label key={c} className={`swatch c-${c}`} title={t.colors[c]}>
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
      <div className="stack">
        {/* A click on the text edits it (the button below does it from the keyboard); its links stay links. */}
        <div className={`description${card.description ? "" : " empty-text"}`} onClick={e => { if (writable && !(e.target instanceof HTMLAnchorElement)) setEditing(true); }}>
          {card.description ? <Markdown text={card.description} /> : writable ? t.card.descriptionPlaceholder : ""}
        </div>
        {writable && <div><button type="button" className="link-button" onClick={() => setEditing(true)}><Text /> {card.description ? t.card.editDescription : t.card.addDescription}</button></div>}
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
        <span className="hint">{t.card.markdownHint}</span>
      </div>
    </form>
  );
}

// The card's checklists: the main one, then any others with a title. A
// step may be given to someone, with a date: it shows in their "My tasks".
function Checklists({ card, writable, choices, people, me, today, locale, t, run }: { card: PanelCard; writable: boolean; choices: Choice[]; people: People; me: string; today: string; locale: Locale; t: Words; run: Run }) {
  const [adding, setAdding] = useState(false);
  const lists: { id: string | null; title: string | null }[] = [{ id: null, title: null }, ...card.checklists.map(l => ({ id: l.id, title: l.title }))];
  return (
    <div className="stack">
      {lists.map(l => (
        <ChecklistBlock key={l.id ?? "main"} list={l} items={card.items.filter(i => i.checklistId === l.id)} card={card} writable={writable} choices={choices} people={people} me={me} today={today} locale={locale} t={t} run={run} />
      ))}
      {writable && (adding ? (
        <form className="row" onSubmit={e => { e.preventDefault(); const title = String(new FormData(e.currentTarget).get("title") ?? "").trim(); if (!title) return; run(() => call("addChecklist", { id: card.id, title }), () => setAdding(false)); }}>
          <label htmlFor="new-checklist" className="visually-hidden">{t.card.checklistTitle}</label>
          <input id="new-checklist" name="title" className="field grow" maxLength={80} placeholder={t.card.checklistTitle} autoFocus onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} />
          <button type="submit" className="button small">{t.card.addChecklist}</button>
          <button type="button" className="link-button" onClick={() => setAdding(false)}>{t.card.cancel}</button>
        </form>
      ) : <div><button type="button" className="link-button" onClick={() => setAdding(true)}><Plus /> {t.card.addChecklist}</button></div>)}
    </div>
  );
}

function ChecklistBlock({ list, items: given, card, writable, choices, people, me, today, locale, t, run }: { list: { id: string | null; title: string | null }; items: PanelItem[]; card: PanelCard; writable: boolean; choices: Choice[]; people: People; me: string; today: string; locale: Locale; t: Words; run: Run }) {
  const [items, setItems] = useState(given);
  useEffect(() => setItems(given), [given]);
  const [open, setOpen] = useState<string | null>(null);
  const search = useMemo(() => localSearch(choices), [choices]);
  // Steps typed fast leave in the order typed, one after the other.
  const steps = useRef<Promise<unknown>>(Promise.resolve());
  const done = items.filter(i => i.done).length;
  const key = list.id ?? "main";
  const nameOf = (id: string) => (id === me ? t.card.you : people[id]?.name ?? choices.find(p => p.id === id)?.name ?? "?");
  const choiceOf = (id: string): Choice => choices.find(p => p.id === id) ?? { kind: "member", id, name: nameOf(id), photo: people[id]?.photo ?? null };
  if (list.id === null && items.length === 0 && !writable) return <p className="muted small">{t.card.noSteps}</p>;
  return (
    <div className="checklist-block">
      {list.title !== null && (
        <div className="row checklist-title">
          {writable ? (
            <>
              <label className="visually-hidden" htmlFor={`checklist-${key}`}>{t.card.checklistTitle}</label>
              <input id={`checklist-${key}`} className="field title-field" defaultValue={list.title} maxLength={80}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== list.title) run(() => call("renameChecklist", { id: list.id!, title: v })); else e.target.value = list.title!; }}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              <button type="button" className="icon-button" onClick={() => run(() => call("removeChecklist", { id: list.id! }))}><Trash /><span className="visually-hidden">{format(t.card.removeChecklist, { title: list.title })}</span></button>
            </>
          ) : <h3>{list.title}</h3>}
        </div>
      )}
      {items.length > 0 && (
        <>
          <div className="row"><span className="small muted">{format(t.card.progress, { done, total: items.length })}</span></div>
          <progress className="progress" value={done} max={items.length} aria-hidden="true" />
        </>
      )}
      <ul className="checklist">
        {items.map(item => (
          <li key={item.id} className={`check-item${item.done ? " done" : ""}`}>
            <div className="check-line">
              <input type="checkbox" id={`item-${item.id}`} checked={item.done} disabled={!writable}
                onChange={e => { setItems(items.map(i => (i.id === item.id ? { ...i, done: e.target.checked } : i))); run(() => call("updateItem", { id: item.id, done: e.target.checked })); }} />
              <label htmlFor={`item-${item.id}`} className="check-text"><span>{item.text}</span></label>
              {item.assignee && <span className="chip" title={format(t.card.stepGivenTo, { name: nameOf(item.assignee) })}><Avatar name={nameOf(item.assignee)} photo={people[item.assignee]?.photo ?? null} size="s" />{nameOf(item.assignee)}</span>}
              {item.dueLabel && <span className={`chip${item.late ? " due-late" : ""}`}>{item.late && <span className="visually-hidden">{t.card.late} · </span>}{item.dueLabel}</span>}
              {writable && (
                <button type="button" className="icon-button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                  <Dots /><span className="visually-hidden">{format(t.card.stepDetails, { text: item.text })}</span>
                </button>
              )}
            </div>
            {writable && open === item.id && (
              <div className="step-details">
                <PeoplePicker id={`step-who-${item.id}`} label={t.card.stepWho} clearable value={item.assignee ? [choiceOf(item.assignee)] : []} search={search} suggestions={choices.slice(0, 12)} labels={t.peoplePicker} lang={locale}
                  onChange={([p]) => run(() => call("updateItem", { id: item.id, assignee: p?.id ?? null }))} />
                <DateField id={`step-due-${item.id}`} label={t.card.stepDue} value={item.due} today={today} labels={t.date} onChange={due => run(() => call("updateItem", { id: item.id, due }))} />
                <button type="button" className="link-button danger" onClick={() => { setItems(items.filter(i => i.id !== item.id)); setOpen(null); run(() => call("removeItem", { id: item.id })); }}>{format(t.card.removeItem, { text: item.text })}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {writable && (
        <form className="row" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const text = String(new FormData(form).get("item") ?? "").trim(); if (!text) return; steps.current = steps.current.then(() => call("addItem", { id: card.id, text, ...(list.id ? { checklist: list.id } : {}) })); form.reset(); }}>
          <label htmlFor={`new-item-${key}`} className="visually-hidden">{t.card.addItem}</label>
          <input id={`new-item-${key}`} name="item" className="field grow" maxLength={300} placeholder={t.card.itemPlaceholder} />
          <button type="submit" className="button small quiet"><Plus />{t.card.addItem}</button>
        </form>
      )}
    </div>
  );
}

// Files go from the browser to the Chest itself, through the kit's file
// picker (drop or choose, the limit said first, progress while sending):
// the tool authorises one upload, the browser sends it, the tool checks it
// arrived and records it; the card's list then shows it.
function Files({ card, writable, people, t, onRemove, onDone }: { card: PanelCard; writable: boolean; people: People; t: Words; onRemove: (id: string) => void; onDone: () => void }) {
  const [picked, setPicked] = useState<readonly PickedFile[]>([]);
  // Three steps around the browser's own upload to the Chest: the tool
  // grants one (an action), the browser sends the file there, the tool
  // records it once the Chest holds it (an action). Each refusal is said
  // in the picker, in the reader's words.
  const upload: Upload = async (file, { onProgress, signal }) => {
    const type = file.type || "application/octet-stream";
    try {
      const grant = await call("uploadFile", { id: card.id, size: file.size }, { quiet: true, refresh: false });
      if (!grant.ok) return { ok: false, error: grant.message };
      const put = await putWithProgress(grant.value.url, file, { headers: { "Content-Type": type }, onProgress, signal });
      if (put.status >= 300) return { ok: false, error: put.status === 413 ? t.errors.file_too_large : t.errors.file_missing };
      const { name } = JSON.parse(put.text) as { name: string };
      const recorded = await call("recordFile", { id: card.id, name, fileName: file.name }, { quiet: true, refresh: false });
      if (!recorded.ok) return { ok: false, error: recorded.message };
      return { ok: true, ref: name };
    } catch {
      return { ok: false, error: t.errors.unavailable };
    }
  };
  // A file recorded leaves the picker: the card's list shows it.
  useEffect(() => {
    if (!picked.some(f => f.status === "ready")) return;
    setPicked(list => list.filter(f => f.status !== "ready"));
    onDone();
  }, [picked, onDone]);
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
      {writable && <FilePicker label={t.card.addFile} files={picked} onChange={update => setPicked(update)} upload={upload} maxSize={25 << 20} labels={t.files} />}
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
              <Avatar name={author} photo={c.importedAuthor ? null : people[c.author]?.photo ?? null} size="m" />
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
// board (the kit's search rule: any word of the name, accents aside); the
// chosen ones are sent with the comment (and told). Its own list, not the
// kit's PeoplePicker: the name is written into the text where one types.
function Composer({ people, t, onSubmit }: { people: Person[]; t: Words; onSubmit: (body: string, mentions: string[]) => void }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Person[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once a chosen name is written in: set as the new
  // text is committed (a layout effect), before any next key — a caret put
  // on the next frame came after the first letters typed on, and moved
  // them ("@Inès Moreau seplea").
  const caretAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = field.current;
    const at = caretAfter.current;
    if (at === null || !el) return;
    el.focus();
    el.setSelectionRange(at, at);
    caretAfter.current = null;
  }, [text]);
  const suggestions = query === null ? [] : searchChoices(people, query, { limit: 6 });
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
    caretAfter.current = before.length;
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
        <ul className="suggestions" id="mention-list" role="listbox" aria-label={t.card.mention}>
          {suggestions.map((p, i) => (
            <li key={p.id} id={`mention-${i}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(p); }}>
              <Avatar name={p.name} photo={p.photo} size="s" />{p.name}
            </li>
          ))}
        </ul>
      )}
      <div className="row"><button type="submit" className="button small" disabled={!text.trim()}>{t.card.comment}</button></div>
    </form>
  );
}

// "Blocked by": the cards this one waits for (each opens; done ones say
// so), one more chosen from the board's open cards; and the cards that
// wait for this one.
function Blockers({ path, view, card, linkable, writable, t, onAdd, onRemove }: { path: string; view: string; card: PanelCard; linkable: { id: string; title: string }[]; writable: boolean; t: Words; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const open = (id: string) => `${path}?${view ? view + "&" : ""}card=${id}`;
  const choices = linkable.filter(c => !card.blockers.some(b => b.id === c.id) && !card.blocking.some(b => b.id === c.id));
  const line = (l: CardLink, remove: boolean) => (
    <li key={l.id} className={`link-line${l.done || l.archived ? " is-done" : ""}`}>
      <a href={open(l.id)} onClick={e => onLinkClick(e, { top: false })}>{l.title}</a>
      {(l.done || l.archived) && <span className="chip done"><Check />{t.card.linkDone}</span>}
      {remove && writable && <button type="button" className="icon-button" onClick={() => onRemove(l.id)}><Close /><span className="visually-hidden">{format(t.card.removeBlocker, { title: l.title })}</span></button>}
    </li>
  );
  return (
    <div className="stack">
      {card.blockers.length > 0 ? <p className="hint">{t.card.blockedByHint}</p> : null}
      {card.blockers.length > 0 && <ul className="links">{card.blockers.map(l => line(l, true))}</ul>}
      {writable && (
        choices.length > 0 ? (
          <div className="row">
            <label className="visually-hidden" htmlFor="add-blocker">{t.card.addBlocker}</label>
            <select id="add-blocker" className="select inline" value="" onChange={e => { if (e.target.value) onAdd(e.target.value); }}>
              <option value="">{t.card.addBlocker}</option>
              {choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        ) : card.blockers.length === 0 && <p className="hint">{t.card.noOtherCards}</p>
      )}
      {card.blocking.length > 0 && (
        <>
          <h3 className="small">{t.card.blocking}</h3>
          <ul className="links">{card.blocking.map(l => line(l, false))}</ul>
        </>
      )}
    </div>
  );
}
