import { call, navigate, toast } from "@argentic/chest-app/client";
import { Avatar } from "@argentic/chest-ui/components";
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { format, money, plural } from "../i18n/format.ts";
import type { Locale } from "../i18n/index.ts";
import { Lost, Trophy } from "./icons.tsx";
import { ReasonDialog } from "./reason-dialog.tsx";
import type { People, Words } from "./shared.ts";

export type BoardStage = { id: string; name: string; kind: "open" | "won" | "lost"; probability: number; total: string };
// A deal as its card shows it, written by the server (its amount, its
// expected close, what its dot means).
export type BoardDeal = {
  id: string; title: string; stageId: string; value: number; valueText: string; company: string | null; closeLabel: string | null;
  owner: string | null; open: boolean; state: "none" | "late" | "today" | "planned"; stateLabel: string; editable: boolean;
};
export type BoardWords = Words<"deals" | "deal" | "common" | "dialog">;
type Props = { stages: BoardStage[]; deals: BoardDeal[]; people: People; me: string; closedDays: number; currency: string; locale: Locale; t: BoardWords };

// Deals and stages are both drag targets: their keys say which is which (a
// deal and a stage may share a number).
const dealKey = (id: string) => "deal:" + id;
const stageKey = (id: string) => "stage:" + id;
const isStageKey = (key: UniqueIdentifier) => String(key).startsWith("stage:");
const raw = (key: UniqueIdentifier) => String(key).replace(/^(deal|stage):/u, "");

// Deals by stage, as the board shows them (and as a drag reorders them).
type Lanes = Record<string, string[]>;
const lanesOf = (stages: BoardStage[], deals: BoardDeal[]): Lanes => {
  const lanes: Lanes = Object.fromEntries(stages.map(s => [s.id, [] as string[]]));
  for (const d of deals) lanes[d.stageId]?.push(d.id);
  return lanes;
};

// The pipeline: one column per stage, its count and its total; a deal is
// dragged (or moved with the keyboard: Space, arrows, Space) to its next
// stage; Enter opens it. Won and Lost ask why, in a few words.
export function DealBoard({ stages, deals, people, me, closedDays, currency, locale, t }: Props) {
  // The id of the cards' keyboard instructions (their aria-describedby):
  // the same on the server and in the browser (each island is a root of
  // its own, with its own prefix).
  const dndId = useId();
  const [, start] = useTransition();
  const byId = useMemo(() => new Map(deals.map(d => [d.id, d])), [deals]);
  // The board as the server says it, unless a deal is being dragged, a
  // reason asked or its move on its way: then as the screen shows it. A
  // refresh that comes meanwhile changes the server's lanes, never the
  // deal in hand; once the move is answered, the server's answer and the
  // end of the move arrive in one render (app/AGENTS.md, optimistic state).
  const served = useMemo(() => lanesOf(stages, deals), [stages, deals]);
  const [moving, setMoving] = useState<Lanes | null>(null);
  const lanes = moving ?? served;
  const [dragging, setDragging] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ id: string; stage: BoardStage; after: string | null; before: string | null } | null>(null);

  // The keyboard moves a deal as on a board: up and down in its stage,
  // left and right to the neighbouring stage.
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const { active, over, droppableRects } = context;
    if (!active) return undefined;
    const current = lanesRef.current;
    const activeId = raw(active.id);
    const at = over ? String(over.id) : dealKey(activeId);
    const lane = isStageKey(at) ? raw(at) : Object.keys(current).find(k => current[k]!.includes(raw(at)));
    if (!lane) return undefined;
    const ids = current[lane]!;
    const order = stages.map(s => s.id);
    let target: string | undefined;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      const index = isStageKey(at) ? ids.indexOf(activeId) : ids.indexOf(raw(at));
      let next = event.code === "ArrowUp" ? ids[index - 1] : ids[index + 1];
      if (next === activeId) next = event.code === "ArrowUp" ? ids[index - 2] : ids[index + 2];
      if (next) target = dealKey(next);
    } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      const nextLane = order[order.indexOf(lane) + (event.code === "ArrowLeft" ? -1 : 1)];
      if (nextLane) {
        const first = current[nextLane]!.find(x => x !== activeId);
        target = first ? dealKey(first) : stageKey(nextLane);
      }
    } else return undefined;
    event.preventDefault();
    const rect = target ? droppableRects.get(target) : undefined;
    return rect ? { x: rect.left + 4, y: rect.top + 4 } : undefined;
  };
  // Space picks a deal up and drops it, Enter drops it too (and opens a deal
  // not in hand), Escape puts it back: dnd-kit starts on Enter by default,
  // which left the keyboard no way to open one.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
  // What a dragged deal is over: under a pointer, the deal (or else the
  // stage) under it; from the keyboard, the nearest deal, a stage only when
  // it is empty.
  //
  // A deal moved into another stage changes the layout under the pointer:
  // for one frame, the answer stays where it was (dnd-kit's multi-container
  // guard), or the deal would bounce between the two stages for ever
  // (React's "maximum update depth", error #185: the board blank).
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const justMoved = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { justMoved.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  const collision: CollisionDetection = args => {
    const activeId = args.active.id;
    let hits: { id: UniqueIdentifier }[];
    if (args.pointerCoordinates) {
      const within = pointerWithin(args);
      const dealsIn = within.filter(h => !isStageKey(h.id) && h.id !== activeId);
      hits = dealsIn.length > 0 ? dealsIn : within;
      // Over a stage that holds deals (below its last one): the nearest of
      // its deals.
      const lane = hits.length === 1 && isStageKey(hits[0]!.id) ? raw(hits[0]!.id) : null;
      const inLane = lane ? (lanesRef.current[lane] ?? []).filter(id => dealKey(id) !== activeId) : [];
      if (lane && inLane.length > 0) {
        const near = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => inLane.includes(raw(c.id))) });
        if (near.length > 0) hits = near;
      }
    } else {
      hits = closestCorners(args).filter(h => !isStageKey(h.id) || (lanesRef.current[raw(h.id)] ?? []).length === 0);
    }
    if (hits.length > 0) {
      lastOver.current = hits[0]!.id;
      return hits;
    }
    if (justMoved.current) lastOver.current = activeId;
    return lastOver.current ? [{ id: lastOver.current }] : [];
  };
  // The stage a drag key (a deal's or a stage's) is in, as the lanes are now.
  const laneOf = (key: string): string | undefined => { const now = lanesRef.current; return isStageKey(key) ? raw(key) : Object.keys(now).find(k => now[k]!.includes(raw(key))); };
  const stageName = (id: string | undefined) => stages.find(s => s.id === id)?.name ?? "";
  const titleOf = (key: UniqueIdentifier) => byId.get(raw(key))?.title ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => format(t.deals.picked, { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? format(t.deals.movedOver, { title: titleOf(active.id), stage: stageName(laneOf(String(over.id))) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? format(t.deals.dropped, { title: titleOf(active.id), stage: stageName(laneOf(String(over.id))) }) : t.deals.cancelled),
    onDragCancel: () => t.deals.cancelled,
  };

  function onDragStart(e: DragStartEvent) {
    setDragging(raw(e.active.id));
    lastOver.current = null;
    setMoving(served);
  }
  // Across stages, the deal follows the pointer at once.
  function onDragOver(e: DragOverEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over || over === String(e.active.id)) return;
    // Read from the lanes as they are now (not as this render saw them).
    const current = lanesRef.current;
    const laneIn = (key: string) => (isStageKey(key) ? raw(key) : Object.keys(current).find(k => current[k]!.includes(raw(key))));
    const from = laneIn(dealKey(active)), to = laneIn(over);
    if (!from || !to || from === to) return;
    const source = current[from]!.filter(x => x !== active);
    const target = current[to]!.filter(x => x !== active);
    const at = isStageKey(over) ? target.length : Math.max(0, target.indexOf(raw(over)));
    target.splice(at, 0, active);
    const next = { ...current, [from]: source, [to]: target };
    lanesRef.current = next;
    justMoved.current = true;
    setMoving(next);
  }
  function send(id: string, stage: BoardStage, after: string | null, before: string | null, reason?: string) {
    start(async () => {
      const r = await call("moveDeal", { id, stage: stage.id, ...(after ? { after } : {}), ...(before ? { before } : {}), ...(reason !== undefined ? { reason } : {}) });
      setMoving(null);
      if (!r.ok) return;
      if (stage.kind === "won") toast(t.deal.wonToast);
      else if (stage.kind === "lost") toast(t.deal.lostToast);
    });
  }
  function onDragEnd(e: DragEndEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    setDragging(null);
    const to = over ? laneOf(over) : undefined;
    if (!over || !to) return setMoving(null);
    const lanesNow = lanesRef.current;
    const list = [...lanesNow[to]!];
    const from = list.indexOf(active);
    // Over the stage itself (its empty space): the deal keeps its place.
    const target = isStageKey(over) ? from : list.indexOf(raw(over));
    if (from >= 0 && target >= 0 && from !== target) {
      list.splice(from, 1);
      list.splice(target, 0, active);
    }
    const index = list.indexOf(active);
    const original = byId.get(active);
    if (original && original.stageId === to && served[to]!.indexOf(active) === index) return setMoving(null);
    setMoving({ ...lanesNow, [to]: list });
    const stage = stages.find(s => s.id === to)!;
    const after = list[index - 1] ?? null, before = list[index + 1] ?? null;
    // Into Won or Lost from elsewhere: ask why first (the board stays as
    // shown while asked).
    if (stage.kind !== "open" && original && original.stageId !== to) return setClosing({ id: active, stage, after, before });
    send(active, stage, after, before);
  }

  const open = (id: string) => void navigate(`/chest/deals/${id}`);
  // While a deal moves, the totals follow the screen (written here); else
  // they are the server's.
  const totalOf = (stage: BoardStage, ids: string[]) => (moving ? money(ids.reduce((n, id) => n + (byId.get(id)?.value ?? 0), 0), locale, { currency }) : stage.total);
  return (
    <>
      <DndContext id={dndId} sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setMoving(null); }} accessibility={{ announcements, screenReaderInstructions: { draggable: t.deals.moveHint } }}>
        <div className={`board${dragging ? " is-dragging" : ""}`} role="list">
          {stages.map(stage => {
            const ids = (lanes[stage.id] ?? []).filter(id => byId.has(id));
            return <Lane key={stage.id} stage={stage} ids={ids} total={totalOf(stage, ids)} byId={byId} people={people} me={me} closedDays={closedDays} locale={locale} onOpen={open} t={t} />;
          })}
        </div>
        <DragOverlay>{dragging && byId.get(dragging) ? <DealTile deal={byId.get(dragging)!} people={people} me={me} overlay t={t} /> : null}</DragOverlay>
      </DndContext>
      {closing && (
        <ReasonDialog
          stage={closing.stage}
          title={byId.get(closing.id)?.title ?? ""}
          onCancel={() => { setClosing(null); setMoving(null); }}
          onConfirm={reason => { const c = closing; setClosing(null); send(c.id, c.stage, c.after, c.before, reason); }}
          t={t}
        />
      )}
    </>
  );
}

function Lane({ stage, ids, total, byId, people, me, closedDays, locale, onOpen, t }: { stage: BoardStage; ids: string[]; total: string; byId: Map<string, BoardDeal>; people: People; me: string; closedDays: number; locale: Locale; onOpen: (id: string) => void; t: BoardWords }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey(stage.id) });
  return (
    <section className={`lane k-${stage.kind}`} role="listitem" aria-labelledby={`lane-${stage.id}`}>
      <header className="lane-head">
        <h2 id={`lane-${stage.id}`}>
          {stage.kind === "won" && <Trophy />}{stage.kind === "lost" && <Lost />}
          <span>{stage.name}</span>
          <span className="count num" aria-label={plural(t.deals.count, ids.length, locale)}>{ids.length}</span>
        </h2>
        <p className="lane-total">
          <span className="num strong">{total}</span>
          <span className="num muted">{stage.kind === "open" ? `${stage.probability}%` : format(t.deals.lastDays, { days: closedDays })}</span>
        </p>
      </header>
      <SortableContext items={ids.map(dealKey)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`lane-deals${isOver ? " drop-hint" : ""}`} data-empty={t.deals.emptyColumn}>
          {ids.map(id => <SortableDeal key={id} deal={byId.get(id)!} people={people} me={me} onOpen={onOpen} t={t} />)}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableDeal(props: { deal: BoardDeal; people: People; me: string; onOpen: (id: string) => void; t: BoardWords }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dealKey(props.deal.id), disabled: !props.deal.editable });
  // The deal's place while the others make room: set on the element itself
  // (the policy refuses a style attribute; a script's own style is allowed).
  const item = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    const el = item.current;
    if (!el) return;
    el.style.transform = CSS.Transform.toString(transform) ?? "";
    el.style.transition = transition ?? "";
  }, [transform, transition]);
  const open = () => props.onOpen(props.deal.id);
  return (
    // The list item stays a list item; the card inside is what one drags,
    // focuses and opens (Enter, never while it is being moved: then Enter
    // drops it).
    <li ref={el => { item.current = el; setNodeRef(el); }} className={`${isDragging ? "dragging" : ""}${props.deal.editable ? "" : " locked"}`}>
      <div {...attributes} {...listeners}
        className="deal-handle"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          listeners?.["onKeyDown"]?.(e);
          if (e.key === "Enter" && !e.defaultPrevented && !isDragging) open();
        }}
        aria-roledescription={undefined}
        role={props.deal.editable ? attributes.role : "link"}
        aria-disabled={undefined}
        aria-label={props.deal.title}>
        <DealTile {...props} />
      </div>
    </li>
  );
}

function DealTile({ deal, people, me, overlay = false, t }: { deal: BoardDeal; people: People; me: string; overlay?: boolean; t: BoardWords }) {
  const owner = deal.owner ? people[deal.owner] : undefined;
  return (
    <div className={`deal-card${overlay ? " overlay" : ""}${deal.owner === me ? " mine" : ""}`}>
      <span className="deal-title">{deal.title}</span>
      {deal.company && <span className="deal-company">{deal.company}</span>}
      <span className="deal-meta">
        <span className="num deal-value">{deal.valueText}</span>
        {deal.closeLabel && <span className="num muted">{deal.closeLabel}</span>}
        {deal.open && <span className={`dot ${deal.state}`} title={deal.stateLabel}><span className="visually-hidden">{deal.stateLabel}</span></span>}
        <span className="push">{owner ? <Avatar name={owner.name} photo={owner.photo} size="s" label={owner.name} /> : <Avatar name="?" size="s" className="avatar-none" label={t.common.unassigned} />}</span>
      </span>
    </div>
  );
}
