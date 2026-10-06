import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useSensor, useSensors, type Announcements, type DragEndEvent, type KeyboardCoordinateGetter, type Modifier } from "@dnd-kit/core";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Alert, Arrow, Back, Blocked } from "../components/icons.tsx";
import { call, navigate, onLinkClick } from "../core/client.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Column } from "../lib/boards.ts";
import type { CardSummary } from "../lib/cards.ts";
import { daysBetween, shifted, span, type TimelineWindow } from "../shared/calendar.ts";
import { addDays } from "../shared/repeat.ts";
import type { People } from "./BoardView.tsx";

type Words = { board: Catalogue["board"]; card: Catalogue["card"] };
type Rows = "column" | "person";
type Dates = { start: string | null; due: string | null };

// The sizes the connectors are drawn with (styles.css: .timeline; a day's
// width, --day, is there too: 32 px, 28 on a phone).
const scaleHeight = 48, groupHeight = 36, rowHeight = 44;

// The board's cards as bars across six weeks, from their start date to
// their due date (a card with one date: that day), in rows by column or
// by person. A bar is dragged to move both dates (its end: the due date
// only), with the mouse, a finger or the keyboard (Space, arrows, Space);
// Enter or a click opens the card. By column, a line joins a card to the
// cards it waits for ("Blocked by"), red when it starts before one of them
// is due. A phone reads the same weeks as a list (weeks with cards, and
// this week): each card once in every week it runs, with its dates.
export function TimelineView({ timeline, columns, cards, people, writable, locale, query, t }: {
  timeline: TimelineWindow;
  columns: Column[];
  cards: CardSummary[];
  people: People;
  writable: boolean;
  locale: Locale;
  query: (change: Record<string, string>) => string;
  t: Words;
}) {
  // The id of the cards' keyboard instructions (their aria-describedby):
  // the same on the server and in the browser (src/core/island.tsx).
  const dndId = useId();
  const w = t.board.timeline;
  const [, start] = useTransition();
  const [rows, setRows] = useState<Rows>("column");
  // Dates moved here before the server says so: kept until the move is
  // answered (the answer and the server's page arrive in one render).
  const [moved, setMoved] = useState<Record<string, Dates>>({});
  const datesOf = (c: CardSummary): Dates => moved[c.id] ?? { start: c.start, due: c.due };
  const [day, setDay] = useState(32);
  // A phone draws narrower days.
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 760px)");
    const set = () => setDay(narrow.matches ? 28 : 32);
    set();
    narrow.addEventListener("change", set);
    return () => narrow.removeEventListener("change", set);
  }, []);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const nameOfDay = (d: string | null) => (d ? timeline.names[d] ?? d : "");

  const placed = cards.filter(c => span(datesOf(c), timeline.first) !== null);
  const undated = cards.filter(c => !c.done && !c.start && !c.due).length;
  const order = (a: CardSummary, b: CardSummary) => (datesOf(a).start ?? datesOf(a).due ?? "").localeCompare(datesOf(b).start ?? datesOf(b).due ?? "") || a.title.localeCompare(b.title);
  const groups: { key: string; title: string; cards: CardSummary[] }[] = rows === "column"
    ? columns.map(c => ({ key: c.id, title: c.name, cards: placed.filter(x => x.columnId === c.id).sort(order) })).filter(g => g.cards.length > 0)
    : [
        ...[...new Set(placed.flatMap(c => c.assignees))].map(a => ({ key: a, title: people[a]?.name ?? "?", cards: placed.filter(c => c.assignees.includes(a)).sort(order) })).sort((a, b) => a.title.localeCompare(b.title)),
        ...(placed.some(c => c.assignees.length === 0) ? [{ key: "~", title: w.nobody, cards: placed.filter(c => c.assignees.length === 0).sort(order) }] : []),
      ];

  // Where each card's bar is drawn (by column each card is on one row).
  const positions = new Map<string, { row: number; y: number }>();
  let y = scaleHeight;
  let row = 0;
  for (const g of groups) {
    y += groupHeight;
    for (const c of g.cards) {
      if (!positions.has(c.id)) positions.set(c.id, { row, y: y + rowHeight / 2 });
      y += rowHeight;
      row++;
    }
  }
  const height = y;
  const width = timeline.days.length * day;
  const links = rows === "column"
    ? placed.flatMap(c => c.blockedBy.filter(b => positions.has(b)).map(b => {
        const blocker = byId.get(b)!;
        const from = span(datesOf(blocker), timeline.first)!, to = span(datesOf(c), timeline.first)!;
        const mine = datesOf(c), theirs = datesOf(blocker);
        const begins = mine.start ?? mine.due, ends = theirs.due ?? theirs.start;
        const conflict = !blocker.done && !!begins && !!ends && begins < ends;
        return { key: `${b}-${c.id}`, x1: (from.to + 1) * day, y1: positions.get(b)!.y, x2: to.from * day, y2: positions.get(c.id)!.y, conflict };
      }))
    : [];
  const todayIndex = daysBetween(timeline.first, timeline.today);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] }, coordinateGetter: dayKeys(day) }),
  );
  // A bar moves along its row only, a whole day at a time.
  const alongRow: Modifier = ({ transform }) => ({ ...transform, x: Math.round(transform.x / day) * day, y: 0 });
  // How far the bar went, for the words said when it is dropped.
  const delta = useRef(0);
  const cardOf = (key: unknown) => byId.get(String(key).replace(/^(bar|end):/u, ""));
  const announcements: Announcements = {
    onDragStart: ({ active }) => format(t.board.picked, { title: cardOf(active.id)?.title ?? "" }),
    onDragMove: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: ({ active }) => {
      const c = cardOf(active.id);
      if (!c) return undefined;
      const next = shifted(datesOf(c), Math.round(delta.current / day), String(active.id).startsWith("end:"));
      return format(w.moved, { title: c.title, from: nameOfDay(next.start ?? next.due), to: nameOfDay(next.due ?? next.start) });
    },
    onDragCancel: () => t.board.cancelled,
  };
  function onDragEnd(e: DragEndEvent) {
    const c = cardOf(e.active.id);
    const n = Math.round(e.delta.x / day);
    if (!c || n === 0) return;
    const next = shifted(datesOf(c), n, String(e.active.id).startsWith("end:"));
    setMoved(m => ({ ...m, [c.id]: next }));
    start(async () => {
      await call("updateCard", { id: c.id, start: next.start, due: next.due });
      setMoved(m => { const { [c.id]: _, ...rest } = m; return rest; });
    });
  }

  return (
    <div className="timeline">
      <div className="calendar-head">
        <a className="icon-button" href={query({ from: timeline.prev })} onClick={e => onLinkClick(e)} title={w.earlier}><Back /><span className="visually-hidden">{w.earlier}</span></a>
        <h2 aria-live="polite">{timeline.title}</h2>
        <a className="icon-button" href={query({ from: timeline.next })} onClick={e => onLinkClick(e)} title={w.later}><Arrow /><span className="visually-hidden">{w.later}</span></a>
        {timeline.first !== timeline.current && <a className="button small quiet" href={query({ from: "" })} onClick={e => onLinkClick(e)}>{w.today}</a>}
        <span className="spacer" />
        <label className="row small">
          <span className="label">{w.rows}</span>
          <select className="select compact" value={rows} onChange={e => setRows(e.target.value as Rows)}>
            <option value="column">{w.byColumn}</option>
            <option value="person">{w.byPerson}</option>
          </select>
        </label>
      </div>
      {undated > 0 && <p className="small muted">{plural(w.undated, undated, locale)}</p>}
      {groups.length === 0 ? <p className="muted tl-empty">{w.empty}</p> : (
        <ol className="tl-weeks">
          {timeline.weeks.map(week => {
            const last = addDays(week.first, 6);
            const running = placed.filter(c => { const d = datesOf(c), a = d.start ?? d.due!, b = d.due ?? d.start!; return (a <= b ? a : b) <= last && (a <= b ? b : a) >= week.first; }).sort(order);
            const current = timeline.today >= week.first && timeline.today <= last;
            if (running.length === 0 && !current) return null;
            return (
              <li key={week.first} className={`tl-week${current ? " current" : ""}`}>
                <h3>{week.label}</h3>
                {running.length === 0 ? <p className="muted small">{w.empty}</p> : (
                  <ul>
                    {running.map(c => {
                      const d = datesOf(c), from = d.start ?? d.due!, to = d.due ?? d.start!;
                      const late = !c.done && !!d.due && d.due < timeline.today;
                      const waits = c.waiting > 0 && !c.done;
                      return (
                        <li key={c.id} className={`tl-week-card${c.done ? " is-done" : ""}${late ? " late" : ""}`}>
                          <a href={cardHref(c.id)} onClick={e => onLinkClick(e)}>{c.title}</a>
                          <span className="tl-week-dates">
                            {late && <><Alert /> {t.card.late} · </>}
                            {waits && <Blocked />}
                            {from === to ? timeline.short[from] : `${timeline.short[from]} → ${timeline.short[to]}`}
                            {" · "}{columns.find(k => k.id === c.columnId)?.name ?? ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {groups.length > 0 && (
        <div className="tl-scroll" tabIndex={0} role="region" aria-label={timeline.title}>
          <DndContext id={dndId} sensors={sensors} modifiers={[alongRow]} onDragStart={() => { delta.current = 0; }} onDragMove={e => { delta.current = e.delta.x; }} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: w.hint } }}>
            {/* Where today is: a class (the policy refuses a style attribute; styles.css). */}
            <div className={`tl-grid${todayIndex >= 0 && todayIndex < timeline.days.length ? ` tl-at-${todayIndex}` : ""}`}>
              <div className="tl-row tl-scale" aria-hidden="true">
                <div className="tl-name" />
                <div className="tl-track">
                  {timeline.days.map(d => (
                    <span key={d.date} className={`tl-day${d.date === timeline.today ? " today" : ""}`}>
                      <span className="tl-month">{d.month}</span>
                      <span className="tl-letter">{d.weekday}</span>
                      <span className="tl-num">{d.day}</span>
                    </span>
                  ))}
                </div>
              </div>
              {groups.map(g => (
                <section key={g.key} className="tl-group" aria-label={g.title}>
                  <h3 className="tl-group-title">{g.title} <span className="chip">{g.cards.length}</span></h3>
                  <ul>
                    {g.cards.map(c => (
                      <li key={c.id} className="tl-row">
                        <div className="tl-name"><a href={cardHref(c.id)} onClick={e => onLinkClick(e)} className={c.done ? "is-done" : undefined}>{c.title}</a></div>
                        <div className="tl-track">
                          <Bar card={c} dates={datesOf(c)} first={timeline.first} writable={writable} href={cardHref(c.id)} nameOfDay={nameOfDay} conflict={links.some(l => l.conflict && l.key.endsWith("-" + c.id))} blockerTitles={c.blockedBy.map(b => byId.get(b)?.title ?? "").filter(Boolean)} t={t} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {todayIndex >= 0 && todayIndex < timeline.days.length && <span className="tl-today" aria-hidden="true" />}
              {links.length > 0 && (
                <svg className="tl-links" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
                  {links.map(l => {
                    const bend = Math.max(l.x1 + 8, Math.min(l.x2 - 8, l.x1 + 12));
                    return <path key={l.key} className={l.conflict ? "conflict" : undefined} d={`M${l.x1} ${l.y1} H${bend} V${l.y2} H${l.x2}`} />;
                  })}
                </svg>
              )}
            </div>
          </DndContext>
        </div>
      )}
    </div>
  );

  function cardHref(id: string): string {
    return query({ card: id });
  }
}

function Bar({ card, dates, first, writable, href, nameOfDay, conflict, blockerTitles, t }: { card: CardSummary; dates: Dates; first: string; writable: boolean; href: string; nameOfDay: (d: string | null) => string; conflict: boolean; blockerTitles: string[]; t: Words }) {
  const w = t.board.timeline;
  const place = span(dates, first)!;
  const bar = useDraggable({ id: "bar:" + card.id, disabled: !writable });
  const end = useDraggable({ id: "end:" + card.id, disabled: !writable || (!dates.due && !dates.start) });
  const open = () => void navigate(href);
  const from = dates.start ?? dates.due, to = dates.due ?? dates.start;
  const label = from === to ? format(w.oneDay, { title: card.title, from: nameOfDay(from) }) : format(w.bar, { title: card.title, from: nameOfDay(from), to: nameOfDay(to) });
  const waiting = card.waiting > 0 && !card.done;
  const drag = bar.transform ?? end.transform;
  // Its place is two classes (its first day, its length: styles.css); a
  // drag moves it on the element itself (the policy refuses a style
  // attribute; a script's own style is allowed).
  const element = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    el.style.transform = bar.transform ? `translateX(${bar.transform.x}px)` : "";
    if (end.transform) el.style.setProperty("--grow", `${end.transform.x}px`);
    else el.style.removeProperty("--grow");
  }, [bar.transform, end.transform]);
  return (
    <div ref={el => { element.current = el; bar.setNodeRef(el); }}
      className={`tl-bar tl-from-${place.from} tl-len-${place.to - place.from + 1}${place.to - place.from < 2 ? " short" : ""}${card.done ? " is-done" : ""}${waiting ? " is-blocked" : ""}${conflict ? " conflict" : ""}${place.cutStart ? " cut-start" : ""}${place.cutEnd ? " cut-end" : ""}${drag ? " moving" : ""}`}>
      <div {...(writable ? bar.listeners : {})} {...bar.attributes} aria-roledescription={undefined} aria-label={label} className="tl-handle"
        onClick={open}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          bar.listeners?.["onKeyDown"]?.(e);
          if (e.key === "Enter" && !e.defaultPrevented && !bar.isDragging) open();
        }}>
        {waiting && <Blocked />}
        <span className="tl-title">{card.title}</span>
        {waiting && <span className="visually-hidden"> — {format(w.waits, { title: blockerTitles.join(", ") })}</span>}
        {conflict && <span className="visually-hidden"> — {format(w.conflict, { title: blockerTitles.join(", ") })}</span>}
      </div>
      {writable && !place.cutEnd && (
        <div ref={end.setNodeRef} {...end.listeners} {...end.attributes} aria-roledescription={undefined} aria-label={format(w.end, { title: card.title }) + ". " + w.endHint} className="tl-end" />
      )}
    </div>
  );
}

// The keyboard moves a bar a day left or right, a week up or down.
function dayKeys(day: number): KeyboardCoordinateGetter {
  return (event, { currentCoordinates }) => {
    const step = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -7 : event.code === "ArrowDown" ? 7 : 0;
    if (step === 0) return undefined;
    event.preventDefault();
    return { x: currentCoordinates.x + step * day, y: currentCoordinates.y };
  };
}
