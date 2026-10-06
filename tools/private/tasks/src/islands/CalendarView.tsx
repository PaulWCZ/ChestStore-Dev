import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Alert, Back, Arrow } from "../components/icons.tsx";
import { call, onLinkClick } from "../core/client.tsx";
import { format, plural } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Label } from "../lib/boards.ts";
import type { CardSummary } from "../lib/cards.ts";
import type { CalendarMonth } from "../shared/calendar.ts";

type Words = { board: Catalogue["board"]; card: Catalogue["card"]; colors: Catalogue["colors"] };

// The month of the board's due dates. A card is dragged to another day
// to move its date (with the mouse, a finger, or the keyboard: Space,
// arrows, Space); a click opens it. On a phone, only the days with cards.
export function CalendarView({ calendar, cards, labels, writable, locale, query, t }: {
  calendar: CalendarMonth;
  locale: Locale;
  cards: CardSummary[];
  labels: Label[];
  writable: boolean;
  query: (change: Record<string, string>) => string;
  t: Words;
}) {
  // The id of the cards' keyboard instructions (their aria-describedby):
  // the same on the server and in the browser (src/core/island.tsx).
  const dndId = useId();
  const [, start] = useTransition();
  // Dates moved here before the server says so: kept until the move is
  // answered (the answer and the server's page arrive in one render).
  const [moved, setMoved] = useState<Record<string, string>>({});
  const dueOf = (c: CardSummary) => moved[c.id] ?? c.due;
  const days = calendar.weeks.flat();
  const first = days[0]!.date, last = days.at(-1)!.date;
  const shown = cards.filter(c => { const d = dueOf(c); return d !== null && d >= first && d <= last; });
  const undated = cards.filter(c => !c.done && !c.due).length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] }, coordinateGetter: dayCoordinates(days.map(d => d.date)) }),
  );
  const title = (id: unknown) => cards.find(c => "card:" + c.id === id)?.title ?? "";
  const label = (id: unknown) => days.find(d => "day:" + d.date === id)?.label ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => format(t.board.picked, { title: title(active.id) }),
    onDragOver: ({ active, over }) => (over ? format(t.board.movedOver, { title: title(active.id), column: label(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? format(t.board.dropped, { title: title(active.id), column: label(over.id) }) : t.board.cancelled),
    onDragCancel: () => t.board.cancelled,
  };
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const id = String(e.active.id).replace(/^card:/u, ""), day = String(e.over.id).replace(/^day:/u, "");
    const card = cards.find(c => c.id === id);
    if (!card || dueOf(card) === day) return;
    setMoved(m => ({ ...m, [id]: day }));
    start(async () => {
      await call("updateCard", { id, due: day });
      setMoved(m => { const { [id]: _, ...rest } = m; return rest; });
    });
  }
  return (
    <div className="calendar">
      <div className="calendar-head">
        <a className="icon-button" href={query({ month: calendar.prev })} onClick={e => onLinkClick(e)} title={t.board.prevMonth}><Back /><span className="visually-hidden">{t.board.prevMonth}</span></a>
        <h2 aria-live="polite">{calendar.title}</h2>
        <a className="icon-button" href={query({ month: calendar.next })} onClick={e => onLinkClick(e)} title={t.board.nextMonth}><Arrow /><span className="visually-hidden">{t.board.nextMonth}</span></a>
        {calendar.month !== calendar.current && <a className="button small quiet" href={query({ month: calendar.current })} onClick={e => onLinkClick(e)}>{t.board.thisMonth}</a>}
        <span className="spacer" />
        {undated > 0 && <span className="small muted">{plural(t.board.undated, undated, locale)}</span>}
      </div>
      <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: t.board.calendarHint } }}>
        <div className="month" role="table" aria-label={calendar.title}>
          <div className="month-row weekdays-row" role="row">
            {calendar.weekdays.map(d => <div key={d.long} role="columnheader" className="weekday-name"><abbr title={d.long}>{d.short}</abbr></div>)}
          </div>
          {calendar.weeks.map(week => (
            <div key={week[0]!.date} className={`month-row${week.some(d => d.date === calendar.today || shown.some(c => dueOf(c) === d.date)) ? "" : " quiet-week"}`} role="row">
              {week.map(d => (
                <Day key={d.date} day={d} today={calendar.today} cards={shown.filter(c => dueOf(c) === d.date)} labels={labels} writable={writable} href={id => query({ card: id })} t={t} />
              ))}
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Day({ day, today, cards, labels, writable, href, t }: { day: CalendarMonth["weeks"][number][number]; today: string; cards: CardSummary[]; labels: Label[]; writable: boolean; href: (id: string) => string; t: Words }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day:" + day.date, disabled: !writable });
  return (
    <div ref={setNodeRef} role="cell" aria-label={day.label} className={`cal-day${day.inMonth ? "" : " outside"}${day.date === today ? " today" : ""}${cards.length > 0 ? " has-cards" : ""}${isOver ? " drop-hint" : ""}`}>
      <span className="cal-date" aria-hidden="true"><span className="cal-weekday">{day.label}</span><span className="cal-num">{day.day}</span></span>
      <ul>
        {cards.map(c => <DayCard key={c.id} card={c} labels={labels} late={!c.done && day.date < today} writable={writable} href={href(c.id)} t={t} />)}
      </ul>
    </div>
  );
}

function DayCard({ card, labels, late, writable, href, t }: { card: CardSummary; labels: Label[]; late: boolean; writable: boolean; href: string; t: Words }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: "card:" + card.id, disabled: !writable });
  const color = labels.find(l => card.labels.includes(l.id))?.color;
  // Where the dragged card is: set on the element itself (the policy
  // refuses a style attribute; a script's own style is allowed).
  const item = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    if (item.current) item.current.style.transform = transform ? `translate(${transform.x}px, ${transform.y}px)` : "";
  }, [transform]);
  return (
    <li ref={el => { item.current = el; setNodeRef(el); }} className={transform ? "moving" : undefined}>
      <a href={href} onClick={e => onLinkClick(e)} {...(writable ? listeners : {})} {...(writable ? attributes : {})} aria-roledescription={undefined}
        className={`cal-card${card.done ? " is-done" : ""}${late ? " late" : ""}${isDragging ? " dragging" : ""}${color ? " c-" + color : ""}`}>
        {color && <span className="bar" aria-hidden="true" />}
        {late && <Alert />}
        {card.dueTime && <span className="cal-time">{card.dueTime}</span>}
        <span>{card.title}</span>
        {late && <span className="visually-hidden"> — {t.card.late}</span>}
      </a>
    </li>
  );
}

// The keyboard moves a card a day left or right, a week up or down.
function dayCoordinates(dates: string[]): KeyboardCoordinateGetter {
  return (event, { context }) => {
    const at = context.over ? String(context.over.id).replace(/^day:/u, "") : null;
    const index = at ? dates.indexOf(at) : -1;
    const step = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -7 : event.code === "ArrowDown" ? 7 : 0;
    if (step === 0 || index < 0) return undefined;
    const next = dates[Math.min(Math.max(index + step, 0), dates.length - 1)]!;
    event.preventDefault();
    const rect = context.droppableRects.get("day:" + next);
    return rect ? { x: rect.left + 8, y: rect.top + 8 } : undefined;
  };
}
