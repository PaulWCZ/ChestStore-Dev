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
import { Dialog, useToast } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { HireDialog } from "../../../../components/hire-dialog.tsx";
import { Ban, Bell, Clock, File, Select, Star } from "../../../../components/icons.tsx";
import type { CandidateCard } from "../../../../lib/candidates.ts";
import { format, intl, plural } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import type { Stage } from "../../../../lib/jobs.ts";
import { candidateReasons, companyReasons, isCandidateReason, type RejectReason } from "../../../../lib/model.ts";
import { bulkMove, bulkMoveBack, bulkReject, moveCandidate, rejectionsLeft, undoReject } from "../../actions.ts";

type Words = { board: Catalogue["board"]; errors: Catalogue["errors"]; reasons: Catalogue["reject"]["reasons"]; reject: Catalogue["reject"]; common: Catalogue["common"]; hire: Catalogue["hire"]; dialog: DialogWords; date: DateWords };
type Failure = { ok: false; error: keyof Catalogue["errors"]; values?: Record<string, string | number> };
// A stage with its name as this reader sees it (lib/stages.ts).
type Lane = Stage & { label: string };

// Candidates and stages are both drag targets: their keys say which is
// which (a candidate and a stage may share a number).
const cardKey = (id: string) => "cand:" + id;
const laneKey = (id: string) => "stage:" + id;
const raw = (key: UniqueIdentifier) => String(key).replace(/^(cand|stage):/u, "");

// Where each candidate is, as the screen shows it (a drop moves them at
// once; the server's answer replaces it).
type Places = Record<string, string>;
const placesOf = (cards: CandidateCard[]): Places => Object.fromEntries(cards.map(c => [c.id, c.stageId]));

export function BoardView({ stages, cards, manage, locale, today, t }: { stages: Lane[]; cards: CandidateCard[]; manage: boolean; locale: Locale; today: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const active = useMemo(() => cards.filter(c => c.status === "active"), [cards]);
  const rejected = useMemo(() => cards.filter(c => c.status === "rejected"), [cards]);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const [places, setPlaces] = useState<Places>(() => placesOf(active));
  const [dragging, setDragging] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  // On a phone, one stage at a time (the tabs choose it): the first with
  // someone in it.
  const [phoneStage, setPhoneStage] = useState<string | null>(null);
  const shownStage = phoneStage ?? stages.find(st => active.some(c => places[c.id] === st.id))?.id ?? stages[0]?.id ?? null;
  useEffect(() => {
    if (!dragging) setPlaces(placesOf(active));
  }, [active, dragging]);

  const stageName = (id: string | undefined) => stages.find(s => s.id === id)?.label ?? "";
  const failed = (r: Failure) => format(t.errors[r.error], r.values ?? {});
  const nameOf = (key: UniqueIdentifier) => byId.get(raw(key))?.name ?? "";
  const stageOfKey = (key: string): string | undefined => (key.startsWith("stage:") ? raw(key) : places[raw(key)]);

  // Into "hired" (from elsewhere), the day they start is asked first.
  const [hiring, setHiring] = useState<{ id: string; to: string } | null>(null);
  const hiredStage = (id: string | undefined) => stages.find(s => s.id === id)?.hired === true;
  function request(id: string, to: string) {
    const from = places[id];
    if (!from || from === to) return;
    if (hiredStage(to) && !hiredStage(from)) setHiring({ id, to });
    else move(id, to);
  }
  // One toast per candidate moved (a second move replaces it); its Undo
  // puts them back and says whether it could.
  function move(id: string, to: string, day?: string | null) {
    const from = places[id];
    if (!from || from === to) return;
    setPlaces(p => ({ ...p, [id]: to }));
    start(async () => {
      const r = await moveCandidate(id, to, day ?? undefined);
      if (!r.ok) {
        setPlaces(p => ({ ...p, [id]: from }));
        return void toast({ text: failed(r), tone: "error" });
      }
      toast({
        id: `move-${id}`,
        text: format(t.board.moved, { name: byId.get(id)?.name ?? "", stage: stageName(to) }),
        undo: async () => {
          setPlaces(p => ({ ...p, [id]: from }));
          const back = await moveCandidate(id, from);
          if (back.ok) return true;
          setPlaces(p => ({ ...p, [id]: to }));
          return failed(back);
        },
      });
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
    // A drop into another stage is announced once, by the toast ("moved
    // to …, Undo"); the live region only says a drop that changed nothing.
    onDragEnd: ({ active: a, over }) => {
      const to = over ? stageOfKey(String(over.id)) : undefined;
      if (to && to !== places[raw(a.id)]) return undefined;
      return over ? format(t.board.dropped, { name: nameOf(a.id), stage: stageName(to) }) : t.board.cancelled;
    },
    onDragCancel: () => t.board.cancelled,
  };
  function onDragStart(e: DragStartEvent) {
    setDragging(raw(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const to = e.over ? stageOfKey(String(e.over.id)) : undefined;
    if (to) request(raw(e.active.id), to);
  }

  const open = (id: string) => router.push(`/chest/candidates/${id}`);

  // Several at once: pick candidates, then move or reject them together
  // (one Undo; rejection emails wait until it is over).
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"reject" | null>(null);
  const toggle = (id: string) => setChosen(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setChosen(new Set()); };
  function moveMany(to: string) {
    const ids = [...chosen];
    if (ids.length === 0 || !to) return;
    const before = Object.fromEntries(ids.map(id => [id, places[id]!]));
    setPlaces(p => ({ ...p, ...Object.fromEntries(ids.map(id => [id, to])) }));
    stopSelecting();
    start(async () => {
      const r = await bulkMove(ids, to);
      if (!r.ok) {
        setPlaces(p => ({ ...p, ...before }));
        return void toast({ text: failed(r), tone: "error" });
      }
      const from = r.value.from;
      toast({
        id: `move-many-${Object.keys(from).sort().join("-")}`,
        text: plural(t.board.movedMany, Object.keys(from).length, locale, { stage: stageName(to) }),
        undo: async () => {
          const back = await bulkMoveBack(from);
          return back.ok || failed(back);
        },
      });
    });
  }

  return (
    <>
      {cards.length === 0 && <p className="board-empty">{t.board.emptyBoard}</p>}
      {manage && active.length > 0 && (
        <div className="board-tools">
          {selecting ? (
            <button type="button" className="button quiet small" onClick={stopSelecting}>{t.board.stopSelecting}</button>
          ) : (
            <button type="button" className="button quiet small" onClick={() => setSelecting(true)}><Select />{t.board.select}</button>
          )}
        </div>
      )}
      {/* On a phone, one stage at a time: tabs with their counts, on as
          many rows as they need (never cut at the screen's edge), and
          only the chosen stage below — no sideways scroll. */}
      <nav className="stage-tabs" aria-label={t.board.stagesNav}>
        {stages.map(stage => (
          <button key={stage.id} type="button" aria-pressed={stage.id === shownStage} onClick={() => setPhoneStage(stage.id)}>
            {stage.label} <span className="lane-count">{active.filter(c => places[c.id] === stage.id).length}</span>
          </button>
        ))}
      </nav>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.moveHint } }}>
        <div className="lanes one-on-phone">
          {stages.map(stage => {
            const here = active.filter(c => places[c.id] === stage.id);
            return (
              <LaneView key={stage.id} stage={stage} count={here.length} current={stage.id === shownStage} manage={manage && !selecting} locale={locale} t={t}>
                {here.map(c => (selecting
                  ? (<li key={c.id}><label className={`cand pick${chosen.has(c.id) ? " chosen" : ""}`}><input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} /><CardBody card={c} locale={locale} t={t} /></label></li>)
                  : manage
                    ? (<DraggableCard key={c.id} card={c} locale={locale} t={t} onOpen={open} />)
                    : (<li key={c.id}><Link className="cand-link" href={`/chest/candidates/${c.id}`}><CardBody card={c} locale={locale} t={t} /></Link></li>)))}
              </LaneView>
            );
          })}
        </div>
        <DragOverlay>{dragging && byId.get(dragging) ? <div className="cand overlay"><CardBody card={byId.get(dragging)!} locale={locale} t={t} /></div> : null}</DragOverlay>
      </DndContext>
      {selecting && (
        <div className="bulk-bar" role="region" aria-label={t.board.selection}>
          <span className="bulk-count" aria-live="polite">{plural(t.board.selected, chosen.size, locale)}</span>
          <label className="visually-hidden" htmlFor="bulk-move">{t.board.moveMany}</label>
          <select id="bulk-move" className="field" value="" disabled={chosen.size === 0} onChange={e => moveMany(e.target.value)}>
            <option value="">{t.board.moveMany}…</option>
            {stages.filter(s => !s.hired).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="button" className="button quiet danger-text" disabled={chosen.size === 0} onClick={() => setBulk("reject")}><Ban />{t.board.rejectMany}</button>
        </div>
      )}
      <Dialog open={bulk === "reject"} title={plural(t.board.rejectTitle, chosen.size, locale)} onClose={() => setBulk(null)} labels={t.dialog}>
        <BulkReject count={chosen.size} locale={locale} t={t} onCancel={() => setBulk(null)} onConfirm={(reason, send) => {
          const ids = [...chosen];
          setBulk(null);
          stopSelecting();
          start(async () => {
            const r = await bulkReject(ids, reason, send);
            if (!r.ok) return void toast({ text: failed(r), tone: "error" });
            const { done, seconds, at } = r.value;
            if (done.length === 0) return;
            const emailed = send && !isCandidateReason(reason);
            const id = `reject-many-${done.join("-")}`;
            let undone = false;
            // Like one rejection (candidate-view.tsx): Undo keeps the emails
            // from leaving; once it is over, the toast says they left.
            toast({
              id,
              text: plural(emailed ? t.board.rejectedManyEmailed : t.board.rejectedMany, done.length, locale, { seconds }),
              ...(emailed ? { duration: seconds * 1000 } : {}),
              undo: async () => {
                undone = true;
                const back = await undoReject(done, at);
                if (!back.ok) return failed(back);
                return back.value.left === 0 || plural(t.board.undoLateMany, back.value.left, locale);
              },
            });
            if (emailed) setTimeout(() => {
              if (undone) return;
              void rejectionsLeft(done, at).then(left => {
                if (!undone && left.ok && left.value.left > 0) toast({ id, text: plural(t.board.rejectedManySent, left.value.left, locale), sent: true });
              });
            }, seconds * 1000 + 500);
          });
        }} />
      </Dialog>
      <HireDialog name={hiring ? byId.get(hiring.id)?.name ?? "" : null} today={today} onCancel={() => setHiring(null)} onConfirm={day => { const h = hiring; setHiring(null); if (h) move(h.id, h.to, day); }} t={{ hire: t.hire, common: t.common, dialog: t.dialog, date: t.date }} />
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

// Rejecting several: a reason (none chosen for you), and the rejection
// email in each candidate's language — off when they stepped back.
function BulkReject({ count, locale, t, onCancel, onConfirm }: { count: number; locale: Locale; t: Words; onCancel: () => void; onConfirm: (reason: RejectReason, send: boolean) => void }) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [send, setSend] = useState(true);
  const theirs = reason !== null && isCandidateReason(reason);
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (reason) onConfirm(reason, send && !theirs); }}>
      <ReasonPicker reason={reason} onChange={setReason} t={t.reject} />
      {!theirs && (
        <label className="check">
          <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} />
          <span>{plural(t.board.rejectEmails, count, locale)}</span>
        </label>
      )}
      <div className="form-actions">
        <button type="submit" className="button danger" disabled={!reason}>{t.reject.confirm}</button>
        <button type="button" className="button quiet" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

// The reasons, in two groups: what the company decided, and the
// candidate stepping back. Nothing is chosen until someone chooses.
export function ReasonPicker({ reason, onChange, t }: { reason: RejectReason | null; onChange: (r: RejectReason) => void; t: Catalogue["reject"] }) {
  const group = (list: readonly RejectReason[], legend: string) => (
    <fieldset className="choices">
      <legend className="label">{legend}</legend>
      <div className="reason-grid">
        {list.map(r => (
          <label key={r} className={`pill${reason === r ? " on" : ""}`}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => onChange(r)} required />
            <span>{t.reasons[r]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="stack reasons">
      {group(companyReasons, t.reasonOurs)}
      {group(candidateReasons, t.reasonTheirs)}
      <p className="hint">{t.reasonHint}</p>
    </div>
  );
}

function LaneView({ stage, count, current, manage, locale, t, children }: { stage: Lane; count: number; current: boolean; manage: boolean; locale: Locale; t: Words; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey(stage.id), disabled: !manage });
  return (
    <section className={`lane${stage.hired ? " hired" : ""}${isOver ? " over" : ""}${current ? " current" : ""}`} aria-labelledby={`lane-${stage.id}`}>
      <div className="lane-head">
        <h2 id={`lane-${stage.id}`}>{stage.label}</h2>
        <span className="lane-count" aria-label={plural(t.board.count, count, locale)}>{count}</span>
      </div>
      <ul ref={setNodeRef} className="lane-cards" data-empty={t.board.emptyStage}>{children}</ul>
    </section>
  );
}

function DraggableCard({ card, locale, t, onOpen }: { card: CandidateCard; locale: Locale; t: Words; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardKey(card.id) });
  return (
    <li>
      <div ref={setNodeRef} {...attributes} {...listeners}
        className={`cand${isDragging ? " dragging" : ""}`}
        aria-roledescription={undefined}
        onClick={() => onOpen(card.id)}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          listeners?.["onKeyDown"]?.(e);
          if (e.key === "Enter" && !e.defaultPrevented) onOpen(card.id);
        }}>
        <CardBody card={card} locale={locale} t={t} />
      </div>
    </li>
  );
}

function CardBody({ card, locale, t }: { card: CandidateCard; locale: Locale; t: Words }) {
  const rating = card.rating !== null ? new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 1 }).format(card.rating) : null;
  return (
    <>
      <span className="cand-top">
        <span className="cand-name">{card.name}</span>
        {card.unseen && <span className="unseen"><span className="dot" aria-hidden="true" />{t.board.notOpened}</span>}
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
        {card.source !== "careers" && <span className="visually-hidden">{t.board.referral}</span>}
      </span>
    </>
  );
}
