"use client";

import {
  closestCorners,
  DndContext,
  pointerWithin,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AvatarStack, Dialog, Menu, Segmented, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Alert, Archive, Arrow, Back, Blocked, Calendar, Chat, Check, CheckList, Clip, Columns, Gear, ListIcon, Lock, Plus, RepeatIcon, Search, Sliders, Text, Timeline } from "../../../../components/icons.tsx";
import type { BoardAccess } from "../../../../lib/access.ts";
import type { Column, Field, Label } from "../../../../lib/boards.ts";
import type { CardSummary } from "../../../../lib/cards.ts";
import { format, intl, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { addCard, addColumn, archiveBoard, archiveColumn, moveCard, moveColumn, updateColumn } from "../../actions.ts";
import { CalendarView } from "./calendar-view.tsx";
import { ListView } from "./list-view.tsx";
import type { CalendarMonth, TimelineWindow } from "./page.tsx";
import { TimelineView } from "./timeline-view.tsx";

type Words = { board: Catalogue["board"]; card: Catalogue["card"]; errors: Catalogue["errors"]; colors: Catalogue["colors"]; dialog: Catalogue["dialog"] };
export type People = Record<string, { name: string; photo: string | null }>;
type Props = {
  board: { id: string; name: string; color: string; access: BoardAccess; archived: boolean; privacy: string | null };
  columns: Column[];
  labels: Label[];
  fields: Field[];
  cards: CardSummary[];
  people: People;
  audience: { id: string; name: string; photo: string | null }[];
  me: string;
  today: string;
  locale: Locale;
  view: "board" | "list" | "calendar" | "timeline";
  calendar: CalendarMonth | null;
  timeline: TimelineWindow | null;
  filter: { who: string; label: string };
  t: Words;
};

// Cards and columns are both drag targets: their keys say which is which
// (a card and a column may share a number).
const cardKey = (id: string) => "card:" + id;
const laneKey = (id: string) => "lane:" + id;
const isLaneKey = (key: UniqueIdentifier) => String(key).startsWith("lane:");
const raw = (key: UniqueIdentifier) => String(key).replace(/^(card|lane):/u, "");

// Cards by column, as the board shows them (and as a drag reorders them).
type Lanes = Record<string, string[]>;
const lanesOf = (columns: Column[], cards: CardSummary[]): Lanes => Object.fromEntries(columns.map(c => [c.id, cards.filter(k => k.columnId === c.id).map(k => k.id)]));

export function BoardView({ board, columns, labels, fields, cards, people, audience, me, today, locale, view, calendar, timeline, filter, t }: Props) {
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [, start] = useTransition();
  const writable = (board.access === "write" || board.access === "own") && !board.archived;
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const [lanes, setLanes] = useState<Lanes>(() => lanesOf(columns, cards));
  const [dragging, setDragging] = useState<string | null>(null);
  // The server's answer replaces what the screen assumed, unless a drag is
  // under way.
  useEffect(() => {
    if (!dragging) setLanes(lanesOf(columns, cards));
  }, [columns, cards, dragging]);

  const fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[error], values), tone: "error" });
  const matches = (c: CardSummary) => (filter.who === "" || (filter.who === "me" ? c.assignees.includes(me) : c.assignees.includes(filter.who))) && (filter.label === "" || c.labels.includes(filter.label));
  const filtered = filter.who !== "" || filter.label !== "";
  // On a phone the view and the filters fold behind one button.
  const [tools, setTools] = useState(false);
  const on = Number(filter.who !== "") + Number(filter.label !== "");
  // The address keeps the view and the filters (a link shows the same).
  const query = (change: Record<string, string>) => {
    const params = new URLSearchParams({ ...(view !== "board" ? { view } : {}), ...(view === "calendar" && calendar ? { month: calendar.month } : {}), ...(view === "timeline" && timeline && timeline.first !== timeline.current ? { from: timeline.first } : {}), ...(filter.who ? { who: filter.who } : {}), ...(filter.label ? { label: filter.label } : {}) });
    for (const [key, value] of Object.entries(change)) if (value) params.set(key, value); else params.delete(key);
    return `${path}${params.size ? "?" + params.toString() : ""}`;
  };
  const setFilter = (key: "who" | "label", value: string) => router.replace(query({ [key]: value }), { scroll: false });

  // The keyboard moves a card as on a board: up and down among the cards of
  // its column, left and right to the neighbouring column (its top).
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const { active, over, droppableRects } = context;
    if (!active) return undefined;
    const current = lanesRef.current;
    const activeId = raw(active.id);
    const at = over ? String(over.id) : cardKey(activeId);
    const lane = isLaneKey(at) ? raw(at) : Object.keys(current).find(k => current[k]!.includes(raw(at)));
    if (!lane) return undefined;
    const ids = current[lane]!;
    const order = columns.map(c => c.id);
    let target: string | undefined;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const index = isLaneKey(at) ? ids.indexOf(activeId) : ids.indexOf(raw(at));
      let id = event.code === "ArrowUp" ? ids[index - 1] : ids[index + 1];
      if (id === activeId) id = event.code === "ArrowUp" ? ids[index - 2] : ids[index + 2];
      if (id) target = cardKey(id);
    } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      const next = order[order.indexOf(lane) + (event.code === "ArrowLeft" ? -1 : 1)];
      if (next) {
        const first = current[next]!.find(x => x !== activeId);
        target = first ? cardKey(first) : laneKey(next);
      }
    } else return undefined;
    event.preventDefault();
    const rect = target ? droppableRects.get(target) : undefined;
    return rect ? { x: rect.left + 4, y: rect.top + 4 } : undefined;
  };
  // Enter opens a card; Space picks it up (dnd-kit starts on both by
  // default, which left the keyboard no way to open one).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  // What a dragged card is over: under a pointer, the card (or else the
  // column) under it; from the keyboard, the nearest card, a column only
  // when it is empty.
  const collision: CollisionDetection = args => {
    if (args.pointerCoordinates) {
      const within = pointerWithin(args);
      if (within.length > 0) {
        const cardsIn = within.filter(h => !isLaneKey(h.id));
        return cardsIn.length > 0 ? cardsIn : within;
      }
    }
    return closestCorners(args).filter(h => !isLaneKey(h.id) || (lanes[raw(h.id)] ?? []).length === 0);
  };
  // The column a drag key (a card's or a column's) is in.
  const laneOf = (key: string): string | undefined => (isLaneKey(key) ? raw(key) : Object.keys(lanes).find(k => lanes[k]!.includes(raw(key))));
  const columnName = (id: string | undefined) => columns.find(c => c.id === id)?.name ?? "";
  const titleOf = (key: UniqueIdentifier) => byId.get(raw(key))?.title ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => format(t.board.picked, { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? format(t.board.movedOver, { title: titleOf(active.id), column: columnName(laneOf(String(over.id))) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? format(t.board.dropped, { title: titleOf(active.id), column: columnName(laneOf(String(over.id))) }) : t.board.cancelled),
    onDragCancel: () => t.board.cancelled,
  };

  function onDragStart(e: DragStartEvent) {
    setDragging(raw(e.active.id));
  }
  // Across columns, the card follows the pointer at once.
  function onDragOver(e: DragOverEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const from = laneOf(cardKey(active)), to = laneOf(over);
    if (!from || !to || from === to) return;
    setLanes(current => {
      const source = current[from]!.filter(x => x !== active);
      const target = [...current[to]!];
      const at = isLaneKey(over) ? target.length : Math.max(0, target.indexOf(raw(over)));
      target.splice(at, 0, active);
      return { ...current, [from]: source, [to]: target };
    });
  }
  function onDragEnd(e: DragEndEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    setDragging(null);
    if (!over) return setLanes(lanesOf(columns, cards));
    const to = laneOf(over);
    if (!to) return;
    const list = [...lanes[to]!];
    const from = list.indexOf(active);
    // Over the column itself (its empty space): the card keeps its place.
    const target = isLaneKey(over) ? from : list.indexOf(raw(over));
    if (from >= 0 && target >= 0 && from !== target) {
      list.splice(from, 1);
      list.splice(target, 0, active);
    }
    setLanes({ ...lanes, [to]: list });
    const index = list.indexOf(active);
    const original = byId.get(active);
    if (original && original.columnId === to && lanesOf(columns, cards)[to]!.indexOf(active) === index) return;
    const after = list[index - 1] ?? null, before = list[index + 1] ?? null;
    start(async () => {
      const result = await moveCard(active, to, after, before);
      if (!result.ok) {
        setLanes(lanesOf(columns, cards));
        // A card that waits for others: said, and "Mark done anyway".
        if (result.error === "blocked") {
          toast({ id: `blocked-${active}`, text: format(t.errors.blocked, result.values), tone: "error", action: { label: t.card.doneAnyway, run: () => start(async () => { const again = await moveCard(active, to, after, before, true); if (!again.ok) fail(again.error, again.values); }) } });
        } else fail(result.error, result.values);
      }
    });
  }

  const openCard = (id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("card", id);
    router.push(`${path}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className="board-head">
        <Link className="icon-button" href="/chest/boards" title={t.board.back}><Back /><span className="visually-hidden">{t.board.back}</span></Link>
        <h1>{board.name}</h1>
        {board.privacy && <Link className="privacy" href={`/chest/boards/${board.id}/settings`} title={t.board.privateTitle}><Lock /><span className="visually-hidden">{t.board.privateTitle}: </span>{board.privacy}</Link>}
        <span className="spacer" />
        <button type="button" className="tools-toggle" aria-expanded={tools} aria-controls="board-tools" onClick={() => setTools(!tools)}>
          <Sliders />{t.board.tools}{on > 0 && <span className="count" aria-label={plural(t.board.toolsOn, on, locale)}>{on}</span>}
        </button>
        <div id="board-tools" className={`board-tools${tools ? " is-open" : ""}`}>
        <div className="filters">
          <label className="visually-hidden" htmlFor="filter-who">{t.board.filter}</label>
          <select id="filter-who" value={filter.who} onChange={e => setFilter("who", e.target.value)}>
            <option value="">{t.board.allPeople}</option>
            <option value="me">{t.board.onlyMine}</option>
            {audience.filter(p => p.id !== me).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {labels.length > 0 && (
            <>
              <label className="visually-hidden" htmlFor="filter-label">{t.card.labels}</label>
              <select id="filter-label" value={filter.label} onChange={e => setFilter("label", e.target.value)}>
                <option value="">{t.board.anyLabel}</option>
                {labels.map(l => <option key={l.id} value={l.id}>{l.name || t.colors[l.color]}</option>)}
              </select>
            </>
          )}
          {filtered && <button type="button" className="link-button" onClick={() => router.replace(query({ who: "", label: "" }), { scroll: false })}>{t.board.clear}</button>}
        </div>
        {/* The view is kept in the address: the kit's Segmented, its link variant. */}
        <Segmented label={t.board.views} link={Link} value={view} className="views" options={[
          { value: "board", label: t.board.boardView, icon: <Columns />, href: query({ view: "", month: "", from: "" }) },
          { value: "list", label: t.board.listView, icon: <ListIcon />, href: query({ view: "list", month: "", from: "" }) },
          { value: "calendar", label: t.board.calendarView, icon: <Calendar />, href: query({ view: "calendar", from: "" }) },
          { value: "timeline", label: t.board.timelineView, icon: <Timeline />, href: query({ view: "timeline", month: "" }) },
        ]} />
        {/* The Chest's search box is folded away on a phone's board: here it is. */}
        <Link className="button small quiet phone-only" href="/chest/search"><Search />{t.board.search}</Link>
        </div>
        <Link className="icon-button" href={`/chest/boards/${board.id}/settings`} title={t.board.settings}><Gear /><span className="visually-hidden">{t.board.settings}</span></Link>
      </div>
      {board.archived && (
        <div className="notice">
          <Archive /><span>{t.board.archivedBoard}</span>
          {board.access === "own" && <button type="button" className="button small quiet" onClick={() => start(async () => { const r = await archiveBoard(board.id, false); if (!r.ok) fail(r.error); })}>{t.board.restore}</button>}
        </div>
      )}
      {!board.archived && !writable && <div className="notice"><span>{t.board.readOnly}</span></div>}

      {view === "list" ? (
        <ListView columns={columns} cards={cards.filter(matches)} labels={labels} fields={fields} people={people} today={today} locale={locale} t={t} />
      ) : view === "calendar" && calendar ? (
        <CalendarView calendar={calendar} cards={cards.filter(matches)} labels={labels} writable={writable} locale={locale} query={query} onError={fail} t={t} />
      ) : view === "timeline" && timeline ? (
        <TimelineView timeline={timeline} columns={columns} cards={cards.filter(matches)} people={people} writable={writable} locale={locale} query={query} onError={fail} t={t} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setLanes(lanesOf(columns, cards)); }} accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.moveHint } }}>
          {columns.length > 1 && (
            <nav className="lane-jump" aria-label={t.board.columns}>
              {columns.map((c, i) => (
                <button key={c.id} type="button" className="chip" onClick={() => document.getElementById(`lane-${c.id}`)?.closest(".lane")?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}>
                  <span aria-hidden="true">{i + 1}</span> {c.name} <span className="muted">{(lanes[c.id] ?? []).length}</span>
                </button>
              ))}
            </nav>
          )}
          <div className={`lanes${dragging ? " is-dragging" : ""}`}>
            {columns.map((column, i) => (
              <Lane
                key={column.id}
                boardId={board.id}
                column={column}
                ids={lanes[column.id] ?? []}
                byId={byId}
                labels={labels}
                people={people}
                matches={matches}
                today={today}
                locale={locale}
                writable={writable}
                first={i === 0}
                last={i === columns.length - 1}
                others={columns.filter(c => c.id !== column.id)}
                neighbours={{ before: columns[i - 1]?.id ?? null, beforeBefore: columns[i - 2]?.id ?? null, after: columns[i + 1]?.id ?? null, afterAfter: columns[i + 2]?.id ?? null }}
                onOpen={openCard}
                onError={fail}
                t={t}
              />
            ))}
            {writable && <AddLane boardId={board.id} onError={fail} t={t} />}
          </div>
          <DragOverlay>{dragging && byId.get(dragging) ? <CardTile card={byId.get(dragging)!} labels={labels} people={people} today={today} locale={locale} overlay t={t} /> : null}</DragOverlay>
        </DndContext>
      )}
    </>
  );
}

function Lane({ boardId, column, ids, byId, labels, people, matches, today, locale, writable, first, last, others, neighbours, onOpen, onError, t }: {
  boardId: string; column: Column; ids: string[]; byId: Map<string, CardSummary>; labels: Label[]; people: People; matches: (c: CardSummary) => boolean; today: string; locale: Locale; writable: boolean; first: boolean; last: boolean; others: Column[];
  neighbours: { before: string | null; beforeBefore: string | null; after: string | null; afterAfter: string | null };
  onOpen: (id: string) => void; onError: (e: keyof Catalogue["errors"], v?: Record<string, string | number>) => void; t: Words;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey(column.id), disabled: !writable });
  const [renaming, setRenaming] = useState(false);
  const [, start] = useTransition();
  const toast = useToast();
  const [archiving, setArchiving] = useState(false);
  const shown = ids.filter(id => byId.has(id) && matches(byId.get(id)!));
  // Archiving a column that holds cards asks where they go; an empty one
  // goes at once. Either way: "Undo".
  const archive = (to: string | null) => {
    setArchiving(false);
    start(async () => {
      const r = await archiveColumn(column.id, true, to);
      if (!r.ok) return onError(r.error, r.values);
      const where = others.find(c => c.id === to)?.name ?? "";
      const text = r.value.moved > 0 ? plural(t.board.columnArchivedMoved, r.value.moved, locale, { column: where }) : r.value.cards > 0 ? plural(t.board.columnArchivedWith, r.value.cards, locale) : t.board.columnArchived;
      // One toast per column; its Undo says whether it worked.
      toast({ id: `archive-column-${column.id}`, text, undo: async () => { const back = await archiveColumn(column.id, false); return back.ok || format(t.errors[back.error], back.values); } });
    });
  };
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"] }>) => {
    start(async () => {
      const r = await step();
      if (!r.ok && r.error) onError(r.error);
    });
  };
  return (
    <section className={`lane${column.done ? " is-done" : ""}`} aria-labelledby={`lane-${column.id}`}>
      <div className="lane-head">
        {renaming ? (
          <form onSubmit={e => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name") ?? ""); setRenaming(false); run(() => updateColumn(column.id, { name })); }}>
            <label className="visually-hidden" htmlFor={`rename-${column.id}`}>{t.board.rename}</label>
            <input id={`rename-${column.id}`} name="name" className="field" defaultValue={column.name} maxLength={60} autoFocus onBlur={e => e.currentTarget.form?.requestSubmit()} onKeyDown={e => { if (e.key === "Escape") setRenaming(false); }} />
          </form>
        ) : (
          <h2 id={`lane-${column.id}`} onDoubleClick={() => writable && setRenaming(true)}>{column.done && <Check />} {column.name}</h2>
        )}
        <span className="count" aria-label={plural(t.board.cards, shown.length, locale)}>{shown.length}</span>
        {writable && (
          // The kit's menu button: arrows, Home/End, a letter, Escape gives
          // the focus back.
          <Menu label={t.board.columnMenu} items={[
            { label: t.board.rename, icon: <Text />, onSelect: () => setRenaming(true) },
            { label: column.done ? t.board.markOpen : t.board.markDone, icon: <Check />, onSelect: () => run(() => updateColumn(column.id, { done: !column.done })) },
            ...(first ? [] : [{ label: t.board.moveLeft, icon: <Back />, onSelect: () => run(() => moveColumn(column.id, neighbours.beforeBefore, neighbours.before)) }]),
            ...(last ? [] : [{ label: t.board.moveRight, icon: <Arrow />, onSelect: () => run(() => moveColumn(column.id, neighbours.after, neighbours.afterAfter)) }]),
            { label: t.board.archiveColumn, icon: <Archive />, onSelect: () => { if (ids.length === 0) archive(null); else setArchiving(true); } },
          ]} />
        )}
      </div>
      {archiving && <ArchiveColumn column={column} count={ids.length} others={others} locale={locale} onArchive={archive} onClose={() => setArchiving(false)} t={t} />}
      <SortableContext items={ids.map(cardKey)} strategy={verticalListSortingStrategy} disabled={!writable}>
        <ul ref={setNodeRef} className={`lane-cards${isOver ? " drop-hint" : ""}`} data-empty={t.board.emptyColumn}>
          {shown.map(id => <SortableCard key={id} card={byId.get(id)!} labels={labels} people={people} today={today} locale={locale} writable={writable} onOpen={onOpen} t={t} />)}
        </ul>
      </SortableContext>
      {writable && <QuickAdd boardId={boardId} columnId={column.id} onError={onError} t={t} />}
    </section>
  );
}

function SortableCard(props: { card: CardSummary; labels: Label[]; people: People; today: string; locale: Locale; writable: boolean; onOpen: (id: string) => void; t: Words }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardKey(props.card.id), disabled: !props.writable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const open = () => props.onOpen(props.card.id);
  // Enter opens (never while this card is being moved: then Enter drops it).
  return (
    // The list item stays a list item; the card inside is what one drags,
    // focuses and opens.
    <li ref={setNodeRef} style={style} className={isDragging ? "dragging" : undefined}>
      <div {...attributes} {...listeners}
        className="card-handle"
        onClick={open}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          listeners?.["onKeyDown"]?.(e);
          if (e.key === "Enter" && !e.defaultPrevented && !isDragging) open();
        }}
        aria-roledescription={undefined}>
        <CardTile {...props} />
      </div>
    </li>
  );
}

function CardTile({ card, labels, people, today, locale, overlay = false, t }: { card: CardSummary; labels: Label[]; people: People; today: string; locale: Locale; overlay?: boolean; writable?: boolean; t: Words }) {
  const cardLabels = card.labels.map(id => labels.find(l => l.id === id)).filter((l): l is Label => !!l);
  const due = card.due;
  const state = !due || card.done ? "" : due < today ? "due-late" : due === today ? "due-today" : "";
  const blocked = card.waiting > 0 && !card.done;
  return (
    <div className={`card${card.done ? " is-done" : ""}${overlay ? " overlay" : ""}`}>
      {/* Labels by name: in a look of greys the words still tell them apart. */}
      {cardLabels.length > 0 && <div className="labels">{cardLabels.map(l => <span key={l.id} className={`label-tag c-${l.color}`}>{l.name || t.colors[l.color]}</span>)}</div>}
      <span className="card-title">{card.title}</span>
      {(due || blocked || card.repeats || card.checklist.total > 0 || card.comments > 0 || card.attachments > 0 || card.hasDescription || card.assignees.length > 0) && (
        <span className="meta">
          {/* Late says so in a word and a sign, never by its colour alone. */}
          {due && <span className={`chip ${card.done ? "done" : state}`}>{state === "due-late" ? <><Alert /><span>{t.card.late}</span> · </> : <Calendar />}{state === "due-today" ? t.card.today : new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(due + "T00:00:00Z"))}{card.dueTime && " · " + card.dueTime}</span>}
          {blocked && <span className="chip blocked" title={plural(t.card.blockedCount, card.waiting, locale)}><Blocked />{t.card.blockedBadge}<span className="visually-hidden"> · {plural(t.card.blockedCount, card.waiting, locale)}</span></span>}
          {card.repeats && !card.done && <span className="stat" title={t.card.repeatBadge}><RepeatIcon /><span className="visually-hidden">{t.card.repeatBadge}</span></span>}
          {card.hasDescription && <span className="stat" title={t.card.description}><Text /></span>}
          {card.checklist.total > 0 && <span className={`stat${card.checklist.done === card.checklist.total ? " chip done" : ""}`} title={t.card.checklist}><CheckList />{card.checklist.done}/{card.checklist.total}</span>}
          {card.comments > 0 && <span className="stat" title={t.card.comments}><Chat />{card.comments}</span>}
          {card.attachments > 0 && <span className="stat" title={t.card.files}><Clip />{card.attachments}</span>}
          {card.assignees.length > 0 && (
            // The kit's stack: three faces at most, then "+2"; every name said once.
            <span className="push">
              <AvatarStack people={card.assignees.map(a => ({ id: a, name: people[a]?.name ?? "?", photo: people[a]?.photo ?? null }))} max={3} size="s" labels={{ more: t.board.othersAssigned }} lang={locale} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function QuickAdd({ boardId, columnId, onError, t }: { boardId: string; columnId: string; onError: (e: keyof Catalogue["errors"], v?: Record<string, string | number>) => void; t: Words }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  function submit() {
    const text = title.trim();
    if (!text) return setOpen(false);
    setTitle("");
    field.current?.focus();
    start(async () => {
      const r = await addCard(boardId, columnId, text);
      if (!r.ok) {
        setTitle(text);
        onError(r.error, r.values);
      }
    });
  }
  if (!open) return <div className="lane-add"><button type="button" className="button open" onClick={() => setOpen(true)}><Plus />{t.board.addCard}</button></div>;
  return (
    <div className="lane-add">
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <label className="visually-hidden" htmlFor={`add-${columnId}`}>{t.board.addCardPlaceholder}</label>
        <textarea ref={field} id={`add-${columnId}`} className="field" rows={2} maxLength={300} value={title} autoFocus placeholder={t.board.addCardPlaceholder}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setOpen(false); }} />
        <div className="row">
          <button type="submit" className="button small">{t.board.add}</button>
          <button type="button" className="link-button" onClick={() => setOpen(false)}>{t.card.cancel}</button>
        </div>
      </form>
    </div>
  );
}

function AddLane({ boardId, onError, t }: { boardId: string; onError: (e: keyof Catalogue["errors"], v?: Record<string, string | number>) => void; t: Words }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  if (!open) return <div className="lane add-lane"><button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.board.addColumn}</button></div>;
  return (
    <div className="lane add-lane">
      <form className="stack" onSubmit={e => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = String(new FormData(form).get("name") ?? "");
        form.reset();
        start(async () => { const r = await addColumn(boardId, name); if (!r.ok) onError(r.error, r.values); });
      }}>
        <label className="visually-hidden" htmlFor="new-column">{t.board.columnPlaceholder}</label>
        <input id="new-column" name="name" className="field" maxLength={60} autoFocus placeholder={t.board.columnPlaceholder} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }} />
        <div className="row">
          <button type="submit" className="button small">{t.board.add}</button>
          <button type="button" className="link-button" onClick={() => setOpen(false)}>{t.card.cancel}</button>
        </div>
      </form>
    </div>
  );
}

// "Archive the column" when it holds cards: where do they go?
function ArchiveColumn({ column, count, others, locale, onArchive, onClose, t }: { column: Column; count: number; others: Column[]; locale: Locale; onArchive: (to: string | null) => void; onClose: () => void; t: Words }) {
  const firstOpen = others.find(c => !c.done) ?? others[0];
  const [choice, setChoice] = useState<"move" | "keep">(firstOpen ? "move" : "keep");
  const [to, setTo] = useState(firstOpen?.id ?? "");
  const formId = useId();
  return (
    <Dialog open title={format(t.board.archiveTitle, { column: column.name })} onClose={onClose} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.card.cancel}</button>
        <button type="submit" form={formId} className="button"><Archive />{t.board.archiveColumn}</button>
      </>}>
      <form id={formId} className="stack" onSubmit={e => { e.preventDefault(); onArchive(choice === "move" && to ? to : null); }}>
        <p>{plural(t.board.archiveHolds, count, locale)}</p>
        <fieldset className="stack plain">
          <legend className="visually-hidden">{t.board.archiveWhere}</legend>
          {others.length > 0 && (
            <label className="choice-line">
              <input type="radio" name="where" checked={choice === "move"} onChange={() => setChoice("move")} />
              <span>{t.board.archiveMove}</span>
            </label>
          )}
          {others.length > 0 && choice === "move" && (
            <div className="indent">
              <label className="visually-hidden" htmlFor={`archive-to-${column.id}`}>{t.board.archiveMove}</label>
              <select id={`archive-to-${column.id}`} className="select" value={to} onChange={e => setTo(e.target.value)}>
                {others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <label className="choice-line">
            <input type="radio" name="where" checked={choice === "keep"} onChange={() => setChoice("keep")} />
            <span>{t.board.archiveKeep}</span>
          </label>
        </fieldset>
      </form>
    </Dialog>
  );
}
