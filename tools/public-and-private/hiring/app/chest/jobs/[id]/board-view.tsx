"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { Bell, Clock, File, Star } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { CandidateCard } from "../../../../lib/candidates.ts";
import { format, intl, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import type { Stage } from "../../../../lib/jobs.ts";
import { moveCandidate } from "../../actions.ts";

type Words = { board: Catalogue["board"]; errors: Catalogue["errors"]; reasons: Catalogue["reject"]["reasons"]; common: Catalogue["common"] };

// Candidates and stages are both drag targets: their keys say which is
// which (a candidate and a stage may share a number).
const cardKey = (id: string) => "cand:" + id;
const laneKey = (id: string) => "stage:" + id;
const raw = (key: UniqueIdentifier) => String(key).replace(/^(cand|stage):/u, "");

// Where each candidate is, as the screen shows it (a drop moves them at
// once; the server's answer replaces it).
type Places = Record<string, string>;
const placesOf = (cards: CandidateCard[]): Places => Object.fromEntries(cards.map(c => [c.id, c.stageId]));

export function BoardView({ stages, cards, manage, locale, t }: { stages: Stage[]; cards: CandidateCard[]; manage: boolean; locale: Locale; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const active = useMemo(() => cards.filter(c => c.status === "active"), [cards]);
  const rejected = useMemo(() => cards.filter(c => c.status === "rejected"), [cards]);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const [places, setPlaces] = useState<Places>(() => placesOf(active));
  const [dragging, setDragging] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  useEffect(() => {
    if (!dragging) setPlaces(placesOf(active));
  }, [active, dragging]);

  const stageName = (id: string | undefined) => stages.find(s => s.id === id)?.name ?? "";
  const nameOf = (key: UniqueIdentifier) => byId.get(raw(key))?.name ?? "";
  const stageOfKey = (key: string): string | undefined => (key.startsWith("stage:") ? raw(key) : places[raw(key)]);

  function move(id: string, to: string, undo = true) {
    const from = places[id];
    if (!from || from === to) return;
    setPlaces(p => ({ ...p, [id]: to }));
    start(async () => {
      const r = await moveCandidate(id, to);
      if (!r.ok) {
        setPlaces(p => ({ ...p, [id]: from }));
        return toast(format(t.errors[r.error], r.values ?? {}));
      }
      if (undo) toast(format(t.board.moved, { name: byId.get(id)?.name ?? "", stage: stageName(to) }), { label: t.common.undo, run: () => move(id, from, false) });
    });
  }

  // The keyboard moves a picked candidate from stage to stage: left and
  // right; up and down do nothing (a stage has no order of its own).
  const placesRef = useRef(places);
  placesRef.current = places;
  const keyboard: KeyboardCoordinateGetter = (event, { context }) => {
    const { active: picked, over, droppableRects } = context;
    if (!picked) return undefined;
    if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") {
      if (event.code === "ArrowUp" || event.code === "ArrowDown") event.preventDefault();
      return undefined;
    }
    event.preventDefault();
    const current = over ? stageOfKey(String(over.id)) : placesRef.current[raw(picked.id)];
    const order = stages.map(s => s.id);
    const next = order[order.indexOf(current ?? "") + (event.code === "ArrowLeft" ? -1 : 1)];
    const rect = next ? droppableRects.get(laneKey(next)) : undefined;
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + 40 } : undefined;
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard }),
  );
  // Only stages are drop targets: under the pointer, or the nearest.
  const collision: CollisionDetection = args => {
    const within = args.pointerCoordinates ? pointerWithin(args) : [];
    return within.length > 0 ? within : closestCenter(args);
  };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => format(t.board.picked, { name: nameOf(a.id) }),
    onDragOver: ({ active: a, over }) => (over ? format(t.board.movedOver, { name: nameOf(a.id), stage: stageName(stageOfKey(String(over.id))) }) : undefined),
    onDragEnd: ({ active: a, over }) => (over ? format(t.board.dropped, { name: nameOf(a.id), stage: stageName(stageOfKey(String(over.id))) }) : t.board.cancelled),
    onDragCancel: () => t.board.cancelled,
  };
  function onDragStart(e: DragStartEvent) {
    setDragging(raw(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const to = e.over ? stageOfKey(String(e.over.id)) : undefined;
    if (to) move(raw(e.active.id), to);
  }

  const open = (id: string) => router.push(`/chest/candidates/${id}`);

  return (
    <>
      {cards.length === 0 && <p className="board-empty">{t.board.emptyBoard}</p>}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.moveHint } }}>
        <div className="lanes">
          {stages.map(stage => {
            const here = active.filter(c => places[c.id] === stage.id);
            return (
              <Lane key={stage.id} stage={stage} count={here.length} manage={manage} locale={locale} t={t}>
                {here.map(c => (manage
                  ? <DraggableCard key={c.id} card={c} locale={locale} t={t} onOpen={open} />
                  : <li key={c.id}><Link className="cand-link" href={`/chest/candidates/${c.id}`}><CardBody card={c} locale={locale} t={t} /></Link></li>))}
              </Lane>
            );
          })}
        </div>
        <DragOverlay>{dragging && byId.get(dragging) ? <div className="cand overlay"><CardBody card={byId.get(dragging)!} locale={locale} t={t} /></div> : null}</DragOverlay>
      </DndContext>
      {rejected.length > 0 && (
        <section className="rejected" aria-labelledby="rejected-title">
          <button type="button" className="button quiet small" aria-expanded={showRejected} aria-controls="rejected-list" onClick={() => setShowRejected(s => !s)}>
            {showRejected ? t.board.hideRejected : plural(t.board.showRejected, rejected.length, locale)}
          </button>
          <h2 id="rejected-title" className="visually-hidden">{t.board.rejected}</h2>
          {showRejected && (
            <ul id="rejected-list" className="rejected-list">
              {rejected.map(c => (
                <li key={c.id}>
                  <Link href={`/chest/candidates/${c.id}`}>
                    <span className="rejected-name">{c.name}</span>
                    <span className="muted small">{c.rejectReason ? t.reasons[c.rejectReason] : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function Lane({ stage, count, manage, locale, t, children }: { stage: Stage; count: number; manage: boolean; locale: Locale; t: Words; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey(stage.id), disabled: !manage });
  return (
    <section className={`lane${stage.hired ? " hired" : ""}${isOver ? " over" : ""}`} aria-labelledby={`lane-${stage.id}`}>
      <div className="lane-head">
        <h2 id={`lane-${stage.id}`}>{stage.name}</h2>
        <span className="lane-count" aria-label={plural(t.board.count, count, locale)}>{count}</span>
      </div>
      <ul ref={setNodeRef} className="lane-cards" data-empty={t.board.emptyStage}>{children}</ul>
    </section>
  );
}

function DraggableCard({ card, locale, t, onOpen }: { card: CandidateCard; locale: Locale; t: Words; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardKey(card.id) });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners}
      className={`cand${isDragging ? " dragging" : ""}`}
      aria-roledescription={undefined}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e: KeyboardEvent<HTMLLIElement>) => {
        listeners?.["onKeyDown"]?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(card.id);
      }}>
      <CardBody card={card} locale={locale} t={t} />
    </li>
  );
}

function CardBody({ card, locale, t }: { card: CandidateCard; locale: Locale; t: Words }) {
  const rating = card.rating !== null ? new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 }).format(card.rating) : null;
  return (
    <>
      <span className="cand-top">
        <span className="cand-name">{card.name}</span>
        {card.unseen && <span className="chip new">{t.board.isNew}</span>}
      </span>
      <span className="cand-meta">
        {rating !== null ? (
          <span className={`rating r${Math.round(card.rating!)}`} title={`${format(t.board.rating, { rating: rating })} · ${plural(t.board.ratingCount, card.ratings, locale)}`}>
            <Star /><span>{rating}</span><span className="visually-hidden">{format(t.board.rating, { rating: rating })}</span>
          </span>
        ) : null}
        <span className="days" title={t.board.daysTitle}><Clock />{plural(t.board.days, card.days, locale)}</span>
        {card.hasCv && <span className="has-cv" title={t.board.hasCv}><File /><span className="visually-hidden">{t.board.hasCv}</span></span>}
        {card.askedOfMe && <span className="asked-me" title={t.board.askedOfMe}><Bell /><span className="visually-hidden">{t.board.askedOfMe}</span></span>}
        {card.source === "team" && <span className="visually-hidden">{t.board.referral}</span>}
      </span>
    </>
  );
}
