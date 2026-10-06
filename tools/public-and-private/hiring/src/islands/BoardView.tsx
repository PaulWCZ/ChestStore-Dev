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
import { call, navigate, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import type { DateWords, DialogWords } from "@argentic/chest-ui/components/logic";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { HireDialog } from "../components/hire-dialog.tsx";
import { Ban, Bell, Clock, File, Select, Star } from "../components/icons.tsx";
import { ReasonPicker } from "../components/reasons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, numberText, plural } from "../shared/format.ts";
import { isCandidateReason, type RejectReason } from "../shared/model.ts";

type Words = { board: Catalogue["board"]; reasons: Catalogue["reject"]["reasons"]; reject: Catalogue["reject"]; common: Catalogue["common"]; hire: Catalogue["hire"]; dialog: DialogWords; date: DateWords };
type MailState = "ready" | "later" | "off" | "unknown";
// A stage with its name as this reader sees it, how many active
// candidates it holds (all of them, not only the cards shown), and
// whether it is the one shown further (?more=).
type Lane = { id: string; label: string; hired: boolean; count: number; open: boolean };
export type Card = {
  id: string; name: string; stageId: string; status: "active" | "rejected"; source: string; rating: number | null; ratings: number; days: number;
  hasCv: boolean; unseen: boolean; askedOfMe: boolean; rejectReason: RejectReason | null; createdAt: string;
};

// Candidates and stages are both drag targets: their keys say which is
// which (a candidate and a stage may share a number).
const cardKey = (id: string) => "cand:" + id;
const laneKey = (id: string) => "stage:" + id;
const raw = (key: UniqueIdentifier) => String(key).replace(/^(cand|stage):/u, "");

// Where each candidate shown is: the server's places, unless a move is on
// its way — then as the screen shows it (the package's recipe: the move's
// answer brings the server's new places and the end of the move in one
// render, no flash of the old order). Only stages are drop targets, and
// nothing moves under the pointer during a drag (a card changes stage on
// the drop only): dnd-kit's collision answer cannot bounce between two
// layouts (React's "maximum update depth").
type Places = Record<string, string>;

export function BoardView({ jobId, stages, cards, rejected, perStage, manage, locale, today, mailing = "unknown", t }: {
  jobId: string; stages: Lane[]; cards: Card[]; rejected: { count: number; shown: boolean; limit: number }; perStage: number;
  manage: boolean; locale: string; today: string; mailing?: MailState; t: Words;
}) {
  // The id of the cards' keyboard instructions (their aria-describedby):
  // the same on the server and in the browser (each island is a root of
  // its own, with its own prefix).
  const dndId = useId();
  const active = useMemo(() => cards.filter(c => c.status === "active"), [cards]);
  const gone = useMemo(() => cards.filter(c => c.status === "rejected"), [cards]);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const served = useMemo<Places>(() => Object.fromEntries(active.map(c => [c.id, c.stageId])), [active]);
  const [pending, setPending] = useState<Places | null>(null);
  const places = pending ?? served;
  const [dragging, setDragging] = useState<string | null>(null);
  // A stage's count as the screen shows it: the server's, plus or minus
  // the moves on their way.
  const countOf = (stage: Lane) => stage.count + active.filter(c => places[c.id] === stage.id && c.stageId !== stage.id).length - active.filter(c => c.stageId === stage.id && places[c.id] !== stage.id).length;
  // On a phone, one stage at a time (the tabs choose it): the first with
  // someone in it.
  const [phoneStage, setPhoneStage] = useState<string | null>(null);
  const shownStage = phoneStage ?? stages.find(st => countOf(st) > 0)?.id ?? stages[0]?.id ?? null;

  const stageName = (id: string | undefined) => stages.find(s => s.id === id)?.label ?? "";
  const nameOf = (key: UniqueIdentifier) => byId.get(raw(key))?.name ?? "";
  const stageOfKey = (key: string): string | undefined => (key.startsWith("stage:") ? raw(key) : places[raw(key)]);

  // Into "hired" (from elsewhere), the day they start is asked first.
  const [hiring, setHiring] = useState<{ id: string; to: string } | null>(null);
  const hiredStage = (id: string | undefined) => stages.find(s => s.id === id)?.hired === true;
  function request(id: string, to: string) {
    const from = places[id];
    if (!from || from === to) return;
    if (hiredStage(to) && !hiredStage(from)) setHiring({ id, to });
    else void move(id, to);
  }
  // One toast per candidate moved (a second move replaces it); its Undo
  // puts them back and says whether it could.
  async function move(id: string, to: string, day?: string | null) {
    const from = places[id];
    if (!from || from === to) return;
    setPending({ ...places, [id]: to });
    const r = await call("moveCandidate", { id, stage: to, ...(day ? { startDate: day } : {}) });
    setPending(null);
    if (!r.ok) return;
    toast({
      id: `move-${id}`,
      text: format(t.board.moved, { name: byId.get(id)?.name ?? "", stage: stageName(to) }),
      undo: async () => {
        const back = await call("moveCandidate", { id, stage: from }, { quiet: true });
        return back.ok || back.message;
      },
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
  // Enter opens a candidate; Space picks them up.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
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

  const open = (id: string) => void navigate(`/chest/candidates/${id}`);

  // Several at once: pick candidates, then move or reject them together
  // (one Undo; rejection emails wait until it is over).
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"reject" | null>(null);
  const toggle = (id: string) => setChosen(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setChosen(new Set()); };
  async function moveMany(to: string) {
    const ids = [...chosen];
    if (ids.length === 0 || !to) return;
    setPending({ ...places, ...Object.fromEntries(ids.map(id => [id, to])) });
    stopSelecting();
    const r = await call("bulkMove", { ids, stage: to });
    setPending(null);
    if (!r.ok) return;
    const from = r.value.from;
    toast({
      id: `move-many-${Object.keys(from).sort().join("-")}`,
      text: plural(t.board.movedMany, Object.keys(from).length, locale, { stage: stageName(to) }),
      undo: async () => {
        const back = await call("bulkMoveBack", Object.fromEntries(Object.entries(from).map(([id, stage]) => [`c${id}`, stage])) as never, { quiet: true });
        return back.ok || back.message;
      },
    });
  }
  async function rejectMany(reason: RejectReason, send: boolean) {
    const ids = [...chosen];
    setBulk(null);
    stopSelecting();
    const r = await call("bulkReject", { ids, reason, send });
    if (!r.ok) return;
    const { done, seconds, at } = r.value;
    if (done.length === 0) return;
    const emailed = send && !isCandidateReason(reason);
    const id = `reject-many-${done.join("-")}`;
    let undone = false;
    // Like one rejection: Undo keeps the emails from leaving; once it is
    // over, the toast says they left.
    toast({
      id,
      text: plural(emailed ? t.board.rejectedManyEmailed : t.board.rejectedMany, done.length, locale, { seconds }),
      ...(emailed ? { duration: seconds * 1000 } : {}),
      undo: async () => {
        undone = true;
        const back = await call("undoReject", { ids: done, since: at }, { quiet: true });
        if (!back.ok) return back.message;
        return back.value.left === 0 || plural(t.board.undoLateMany, back.value.left, locale);
      },
    });
    if (emailed) setTimeout(() => {
      if (undone) return;
      void call("rejectionsLeft", { ids: done, since: at }, { quiet: true, refresh: false }).then(left => {
        if (!undone && left.ok && left.value.left > 0) toast({ id, text: plural(t.board.rejectedManySent, left.value.left, locale), sent: true });
      });
    }, seconds * 1000 + 500);
  }

  const total = stages.reduce((n, s) => n + s.count, 0);
  return (
    <>
      {total === 0 && rejected.count === 0 && <p className="board-empty">{t.board.emptyBoard}</p>}
      {manage && total > 0 && (
        <div className="board-tools">
          {selecting
            ? <button type="button" className="button quiet small" onClick={stopSelecting}>{t.board.stopSelecting}</button>
            : <button type="button" className="button quiet small" onClick={() => setSelecting(true)}><Select />{t.board.select}</button>}
        </div>
      )}
      {/* On a phone, one stage at a time: tabs with their counts, on as
          many rows as they need (never cut at the screen's edge), and only
          the chosen stage below — no sideways scroll. */}
      <nav className="stage-tabs" aria-label={t.board.stagesNav}>
        {stages.map(stage => (
          <button key={stage.id} type="button" aria-pressed={stage.id === shownStage} onClick={() => setPhoneStage(stage.id)}>
            {stage.label} <span className="lane-count">{countOf(stage)}</span>
          </button>
        ))}
      </nav>
      <DndContext id={dndId} sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.moveHint } }}>
        <div className="lanes one-on-phone">
          {stages.map(stage => {
            const here = active.filter(c => places[c.id] === stage.id);
            const hidden = countOf(stage) - here.length;
            return (
              <LaneView key={stage.id} stage={stage} count={countOf(stage)} current={stage.id === shownStage} manage={manage && !selecting} locale={locale} t={t}
                more={hidden > 0 ? <a className="button link small lane-more" href={`/chest/jobs/${jobId}?more=${stage.id}`}>{plural(t.board.more, hidden, locale)}</a>
                  : stage.open && perStage < stage.count ? <a className="button link small lane-more" href={`/chest/jobs/${jobId}`}>{t.board.fewer}</a> : null}>
                {here.map(c => (selecting
                  ? (<li key={c.id} id={`cand-${c.id}`}><label className={`cand pick${chosen.has(c.id) ? " chosen" : ""}`}><input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} /><CardBody card={c} locale={locale} t={t} /></label></li>)
                  : manage
                    ? (<DraggableCard key={c.id} card={c} locale={locale} t={t} onOpen={open} />)
                    : (<li key={c.id} id={`cand-${c.id}`}><a className="cand-link" href={`/chest/candidates/${c.id}`}><CardBody card={c} locale={locale} t={t} /></a></li>)))}
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
          <select id="bulk-move" className="field" value="" disabled={chosen.size === 0} onChange={e => void moveMany(e.target.value)}>
            <option value="">{t.board.moveMany}…</option>
            {stages.filter(s => !s.hired).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="button" className="button quiet danger-text" disabled={chosen.size === 0} onClick={() => setBulk("reject")}><Ban />{t.board.rejectMany}</button>
        </div>
      )}
      <Dialog open={bulk === "reject"} title={plural(t.board.rejectTitle, chosen.size, locale)} onClose={() => setBulk(null)} labels={t.dialog}>
        <BulkReject count={chosen.size} locale={locale} mailing={mailing} t={t} onCancel={() => setBulk(null)} onConfirm={(reason, send) => void rejectMany(reason, send)} />
      </Dialog>
      <HireDialog name={hiring ? byId.get(hiring.id)?.name ?? "" : null} today={today} onCancel={() => setHiring(null)} onConfirm={day => { const h = hiring; setHiring(null); if (h) void move(h.id, h.to, day); }} t={{ hire: t.hire, common: t.common, dialog: t.dialog, date: t.date }} />
      {rejected.count > 0 && (
        <section className="rejected" aria-labelledby="rejected-title">
          <a className="button quiet small" href={rejected.shown ? `/chest/jobs/${jobId}` : `/chest/jobs/${jobId}?rejected=1`} aria-expanded={rejected.shown}>
            {rejected.shown ? t.board.hideRejected : plural(t.board.showRejected, rejected.count, locale)}
          </a>
          <h2 id="rejected-title" className="visually-hidden">{t.board.rejected}</h2>
          {rejected.shown && (
            <ul id="rejected-list" className="rejected-list">
              {gone.map(c => (
                <li key={c.id} id={`gone-${c.id}`}>
                  <a href={`/chest/candidates/${c.id}`}>
                    <span className="rejected-name">{c.name}</span>
                    <span className="muted small">{c.rejectReason ? t.reasons[c.rejectReason] : ""}</span>
                  </a>
                </li>
              ))}
              {gone.length < rejected.count && <li className="muted small">{plural(t.board.more, rejected.count - gone.length, locale)}</li>}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// Rejecting several: a reason (none chosen for you), and the rejection
// email in each candidate's language — off when they stepped back.
function BulkReject({ count, locale, mailing, t, onCancel, onConfirm }: { count: number; locale: string; mailing: MailState; t: Words; onCancel: () => void; onConfirm: (reason: RejectReason, send: boolean) => void }) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  // No mail on this Chest: nothing is offered that would not leave.
  const off = mailing === "off";
  const [send, setSend] = useState(!off);
  const theirs = reason !== null && isCandidateReason(reason);
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (reason) onConfirm(reason, send && !theirs); }}>
      <ReasonPicker reason={reason} onChange={setReason} t={t.reject} />
      {!theirs && off && <p className="hint" data-mail="off">{t.board.rejectNoMail}</p>}
      {!theirs && !off && (
        <label className="check">
          <input type="checkbox" checked={send} onChange={e => setSend(e.target.checked)} />
          <span>{plural(t.board.rejectEmails, count, locale)}</span>
        </label>
      )}
      {!theirs && send && mailing === "later" && <p className="hint">{t.board.mailLater}</p>}
      <div className="form-actions">
        <button type="submit" className="button danger" disabled={!reason}>{t.reject.confirm}</button>
        <button type="button" className="button quiet" onClick={onCancel}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

function LaneView({ stage, count, current, manage, locale, t, more, children }: { stage: Lane; count: number; current: boolean; manage: boolean; locale: string; t: Words; more: ReactNode; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: laneKey(stage.id), disabled: !manage });
  return (
    <section className={`lane${stage.hired ? " hired" : ""}${isOver ? " over" : ""}${current ? " current" : ""}`} aria-labelledby={`lane-${stage.id}`}>
      <div className="lane-head">
        <h2 id={`lane-${stage.id}`}>{stage.label}</h2>
        <span className="lane-count" aria-label={plural(t.board.count, count, locale)}>{count}</span>
      </div>
      <ul ref={setNodeRef} className="lane-cards" data-empty={t.board.emptyStage}>{children}</ul>
      {more}
    </section>
  );
}

function DraggableCard({ card, locale, t, onOpen }: { card: Card; locale: string; t: Words; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardKey(card.id) });
  return (
    <li id={`cand-${card.id}`}>
      <div ref={setNodeRef} {...attributes} {...listeners}
        className={`cand${isDragging ? " dragging" : ""}`}
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

function CardBody({ card, locale, t }: { card: Card; locale: string; t: Words }) {
  const rating = card.rating !== null ? numberText(card.rating, locale, 1) : null;
  return (
    <>
      <span className="cand-top">
        <span className="cand-name">{card.name}</span>
        {card.unseen && <span className="unseen"><span className="dot" aria-hidden="true" />{t.board.notOpened}</span>}
      </span>
      <span className="cand-meta">
        {rating !== null ? (
          <span className={`rating r${Math.round(card.rating!)}`} title={`${format(t.board.rating, { rating })} · ${plural(t.board.ratingCount, card.ratings, locale)}`}>
            <Star /><span>{rating}</span><span className="visually-hidden">{format(t.board.rating, { rating })}</span>
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
