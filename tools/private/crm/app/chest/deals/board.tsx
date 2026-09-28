"use client";

import {
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Lost, Trophy } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Deal } from "../../../lib/deals.ts";
import { format, money, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { moveDeal } from "../actions.ts";
import { ReasonDialog } from "../ui/reason-dialog.tsx";
import type { People } from "../ui/shared.ts";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost"; probability: number };
type BoardDeal = Deal & { editable: boolean; closeLabel: string | null };
type Props = { stages: Stage[]; deals: BoardDeal[]; people: People; me: string; today: string; closedDays: number; locale: Locale; t: Catalogue };

// Deals and stages are both drag targets: their keys say which is which (a
// deal and a stage may share a number).
const dealKey = (id: string) => "deal:" + id;
const stageKey = (id: string) => "stage:" + id;
const isStageKey = (key: UniqueIdentifier) => String(key).startsWith("stage:");
const raw = (key: UniqueIdentifier) => String(key).replace(/^(deal|stage):/u, "");

type Lanes = Record<string, string[]>;
const lanesOf = (stages: Stage[], deals: BoardDeal[]): Lanes => Object.fromEntries(stages.map(s => [s.id, deals.filter(d => d.stageId === s.id).map(d => d.id)]));

// The pipeline: one column per stage, its count and its total; a deal is
// dragged (or moved with the keyboard) to its next stage. Won and Lost ask
// why, in a few words.
export function DealBoard({ stages, deals, people, me, today, closedDays, locale, t }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const byId = useMemo(() => new Map(deals.map(d => [d.id, d])), [deals]);
  const [lanes, setLanes] = useState<Lanes>(() => lanesOf(stages, deals));
  const [dragging, setDragging] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ id: string; stage: Stage; after: string | null; before: string | null } | null>(null);
  useEffect(() => {
    if (!dragging && !closing) setLanes(lanesOf(stages, deals));
  }, [stages, deals, dragging, closing]);
  const reset = () => setLanes(lanesOf(stages, deals));

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const collision: CollisionDetection = args => {
    if (args.pointerCoordinates) {
      const within = pointerWithin(args);
      if (within.length > 0) {
        const dealsIn = within.filter(h => !isStageKey(h.id));
        return dealsIn.length > 0 ? dealsIn : within;
      }
    }
    return closestCorners(args).filter(h => !isStageKey(h.id) || (lanes[raw(h.id)] ?? []).length === 0);
  };
  const laneOf = (key: string): string | undefined => (isStageKey(key) ? raw(key) : Object.keys(lanes).find(k => lanes[k]!.includes(raw(key))));
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
  }
  function onDragOver(e: DragOverEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const from = laneOf(dealKey(active)), to = laneOf(over);
    if (!from || !to || from === to) return;
    setLanes(current => {
      const source = current[from]!.filter(x => x !== active);
      const target = [...current[to]!];
      const at = isStageKey(over) ? target.length : Math.max(0, target.indexOf(raw(over)));
      target.splice(at, 0, active);
      return { ...current, [from]: source, [to]: target };
    });
  }
  function send(id: string, stage: Stage, after: string | null, before: string | null, reason?: string) {
    start(async () => {
      const r = await moveDeal(id, stage.id, after, before, reason);
      if (!r.ok) {
        reset();
        return toast(format(t.errors[r.error], r.values));
      }
      if (stage.kind === "won") toast(t.deal.wonToast);
      else if (stage.kind === "lost") toast(t.deal.lostToast);
    });
  }
  function onDragEnd(e: DragEndEvent) {
    const active = raw(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    setDragging(null);
    if (!over) return reset();
    const to = laneOf(over);
    if (!to) return;
    const list = [...lanes[to]!];
    const from = list.indexOf(active);
    const target = isStageKey(over) ? from : list.indexOf(raw(over));
    if (from >= 0 && target >= 0 && from !== target) {
      list.splice(from, 1);
      list.splice(target, 0, active);
    }
    setLanes({ ...lanes, [to]: list });
    const index = list.indexOf(active);
    const original = byId.get(active);
    if (original && original.stageId === to && lanesOf(stages, deals)[to]!.indexOf(active) === index) return;
    const stage = stages.find(s => s.id === to)!;
    const after = list[index - 1] ?? null, before = list[index + 1] ?? null;
    // Into Won or Lost from elsewhere: ask why first.
    if (stage.kind !== "open" && original && original.stageId !== to) return setClosing({ id: active, stage, after, before });
    send(active, stage, after, before);
  }

  const open = (id: string) => router.push(`/chest/deals/${id}`);
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); reset(); }} accessibility={{ announcements, screenReaderInstructions: { draggable: t.deals.moveHint } }}>
        <div className="board" role="list">
          {stages.map(stage => (
            <Lane key={stage.id} stage={stage} ids={lanes[stage.id] ?? []} byId={byId} people={people} me={me} today={today} closedDays={closedDays} locale={locale} onOpen={open} t={t} />
          ))}
        </div>
        <DragOverlay>{dragging && byId.get(dragging) ? <DealTile deal={byId.get(dragging)!} people={people} me={me} today={today} locale={locale} overlay t={t} /> : null}</DragOverlay>
      </DndContext>
      {closing && (
        <ReasonDialog
          stage={closing.stage}
          title={byId.get(closing.id)?.title ?? ""}
          onCancel={() => { setClosing(null); reset(); }}
          onConfirm={reason => { const c = closing; setClosing(null); send(c.id, c.stage, c.after, c.before, reason); }}
          t={t}
        />
      )}
    </>
  );
}

function Lane({ stage, ids, byId, people, me, today, closedDays, locale, onOpen, t }: { stage: Stage; ids: string[]; byId: Map<string, BoardDeal>; people: People; me: string; today: string; closedDays: number; locale: Locale; onOpen: (id: string) => void; t: Catalogue }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey(stage.id) });
  const shown = ids.filter(id => byId.has(id));
  const total = shown.reduce((n, id) => n + (byId.get(id)?.value ?? 0), 0);
  return (
    <section className={`lane k-${stage.kind}`} role="listitem" aria-labelledby={`lane-${stage.id}`}>
      <header className="lane-head">
        <h2 id={`lane-${stage.id}`}>
          {stage.kind === "won" && <Trophy />}{stage.kind === "lost" && <Lost />}
          <span>{stage.name}</span>
          <span className="count num" aria-label={plural(t.deals.count, shown.length, locale)}>{shown.length}</span>
        </h2>
        <p className="lane-total">
          <span className="num strong">{money(total, locale)}</span>
          <span className="num muted">{stage.kind === "open" ? `${stage.probability}%` : format(t.deals.lastDays, { days: closedDays })}</span>
        </p>
      </header>
      <SortableContext items={shown.map(dealKey)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`lane-deals${isOver ? " drop-hint" : ""}`} data-empty={t.deals.emptyColumn}>
          {shown.map(id => <SortableDeal key={id} deal={byId.get(id)!} people={people} me={me} today={today} locale={locale} onOpen={onOpen} t={t} />)}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableDeal(props: { deal: BoardDeal; people: People; me: string; today: string; locale: Locale; onOpen: (id: string) => void; t: Catalogue }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dealKey(props.deal.id), disabled: !props.deal.editable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const open = () => props.onOpen(props.deal.id);
  return (
    // The list item stays a list item; the card inside is what one drags,
    // focuses and opens.
    <li ref={setNodeRef} style={style} className={`${isDragging ? "dragging" : ""}${props.deal.editable ? "" : " locked"}`}>
      <div {...attributes} {...listeners}
        className="deal-handle"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          listeners?.["onKeyDown"]?.(e);
          if (e.key === "Enter" && !e.defaultPrevented) open();
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

function DealTile({ deal, people, me, today, overlay = false, t, locale }: { deal: BoardDeal; people: People; me: string; today: string; overlay?: boolean; locale: Locale; t: Catalogue }) {
  const step = deal.step;
  const state = !step ? "none" : step.due < today ? "late" : step.due === today ? "today" : "planned";
  const stateLabel = state === "none" ? t.deals.noStep : state === "late" ? t.deals.stepLate : state === "today" ? t.deals.stepToday : step!.text;
  const owner = deal.owner ? people[deal.owner] : undefined;
  return (
    <div className={`deal-card${overlay ? " overlay" : ""}${deal.owner === me ? " mine" : ""}`}>
      <span className="deal-title">{deal.title}</span>
      {deal.company && <span className="deal-company">{deal.company.name}</span>}
      <span className="deal-meta">
        <span className="num deal-value">{money(deal.value, locale)}</span>
        {deal.closeLabel && <span className="num muted">{deal.closeLabel}</span>}
        {deal.closedAt === null && <span className={`dot ${state}`} title={stateLabel}><span className="visually-hidden">{stateLabel}</span></span>}
        <span className="push">{owner ? <Avatar name={owner.name} photo={owner.photo} size={22} title={owner.name} /> : <span className="avatar empty-avatar" title={t.common.unassigned} aria-label={t.common.unassigned} role="img">?</span>}</span>
      </span>
    </div>
  );
}
