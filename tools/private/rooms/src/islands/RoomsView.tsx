import { call, toast, type Outcome } from "@argentic/chest-app/client";
import { Avatar, Dialog, PageHeader, PeoplePicker, TimeSelect } from "@argentic/chest-ui/components";
import { localSearch, moveEnd, moveStart } from "@argentic/chest-ui/components/logic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useMinutes } from "../components/clock.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { DayPicker, type DayPickerProps } from "../components/day-picker.tsx";
import { equipmentIcons } from "../components/equipment.tsx";
import { CalendarAdd, Check, Lock, Plus, Repeat, Seat } from "../components/icons.tsx";
import { OfficePicker, type OfficePickerProps } from "../components/office-picker.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, formatDay, formatNumber, formatSpan, formatTime, plural } from "../i18n/format.ts";
import { addDays, checkInOpens, equipment as equipmentKeys, freeSlots, limits, step, tapStart, type Equipment } from "../shared/model.ts";

export type GridRoom = { id: string; name: string; capacity: number; equipment: Equipment[]; note: string; photo: boolean; floor: string; group: { name: string; mine: boolean } | null };
type Person = { id: string; name: string; photo: string | null };
// checkable: check-in is on, it is mine, today, not checked in yet, and —
// by the reader's clock (useMinutes) — it starts within ten minutes or is
// under way.
export type GridBooking = { id: string; roomId: string; start: number; end: number; title: string; series: string | null; organiser: Person; attendees: Person[]; mine: boolean; canChange: boolean; checkedIn: boolean; checkable: boolean };
// What the page sends (props are rendered and sent twice in a page, and an
// office may hold hundreds of rooms, its day as many bookings): each
// person once in `who` ([id, name, photo]), each booking a row naming them
// by their place in it — [id, room, start, end, title, organiser, guests,
// flags (1 mine, 2 may change, 4 checked in, 8 may check in today: the
// clock decides when), series].
export type Who = [string, string, string | null][];
export type SentBooking = [string, string, number, number, string, number, number[], number, string | null];
const personOf = (who: Who, i: number): Person => ({ id: who[i]?.[0] ?? "", name: who[i]?.[1] ?? "", photo: who[i]?.[2] ?? null });
export function expand([id, room, start, end, title, by, guests, flags, series]: SentBooking, who: Who): GridBooking {
  return { id, roomId: room, start, end, title, series, organiser: personOf(who, by), attendees: guests.map(g => personOf(who, g)), mine: (flags & 1) !== 0, canChange: (flags & 2) !== 0, checkedIn: (flags & 4) !== 0, checkable: (flags & 8) !== 0 };
}

export type RoomWords = { rooms: Catalogue["rooms"]; booking: Catalogue["booking"]; equipment: Catalogue["equipment"]; closedDay: string; dialog: Catalogue["kit"]["dialog"]; peoplePicker: Catalogue["kit"]["peoplePicker"]; date: Catalogue["kit"]["date"] };
type Words = RoomWords;
type Draft = { roomId: string; day: string; start: number; end: number; title: string; attendees: string[]; weekly: boolean; weeks: number; for: string };
type Open = { mode: "new"; draft: Draft } | { mode: "detail"; id: string } | { mode: "edit"; id: string; draft: Draft } | null;
// Why a day cannot be booked, if it cannot: past, closed, or not open yet
// (beyond how far ahead one may book; opensOn says when it opens).
export type Locked = { why: "past" | "closed" | "notYet"; opensOn?: string } | null;

export function RoomsView({ head, strip, notice, lockedHint, day, days, today, now: served, zone, locked: lockedDay, open, close, maxWeeks, rooms, bookings: sent, who, people: team, bookFor, initial, told, calendarPage, locale, t }: {
  // The page's title and the line under it; the office picker; the days.
  // Here, so that the page's one action, "Book a room", sits at the top.
  head: { title: string; intro: string; offices: OfficePickerProps | null };
  // Why the day shown is not the one asked for (after hours: tomorrow).
  notice: string | null;
  // Why the day cannot be booked, in words (null: it can).
  lockedHint: string | null;
  strip: DayPickerProps;
  day: string;
  // The days the booking form offers (value, words), the day shown among them.
  days: { value: string; label: string }[];
  // Today in the Chest's zone (the day field's "today").
  today: string;
  now: number | null;
  // The office's zone: the clock of this page.
  zone: string;
  locked: Locked;
  open: number;
  close: number;
  maxWeeks: number;
  rooms: GridRoom[];
  bookings: SentBooking[];
  // The people named by the bookings and the pickers.
  who: Who;
  // Whom the pickers offer (places in who).
  people: number[];
  // An admin may book for someone else.
  bookFor: boolean;
  initial: string | null;
  // How guests hear of a booking: the bell; the calendar; email too.
  told: "bell" | "calendar" | "mail";
  // The Chest's page of the member's calendar feed, when it keeps one.
  calendarPage: string | null;
  locale: string;
  t: Words;
}) {
  // Now, kept current by the clock while the page is open (today only).
  const ticking = useMinutes(zone, served ?? 0);
  const now = served === null ? null : ticking;
  const bookings = useMemo(() => sent.map(b => expand(b, who)).map(b => ({ ...b, checkable: b.checkable && now !== null && now >= b.start - checkInOpens && now < b.end })), [sent, who, now]);
  const people = useMemo(() => team.map(id => personOf(who, id)), [team, who]);
  const [dialog, setDialog] = useState<Open>(initial ? { mode: "detail", id: initial } : null);
  const [dirty, setDirty] = useState(false);
  // The earliest a new booking may start: now's quarter on today.
  const earliest = now === null ? open : Math.max(open, Math.floor(now / step) * step);
  // Where a new booking starts when nothing was picked: the next round
  // hour today, 09:00 on another day (never the grid's first quarter).
  const preferred = Math.min(Math.max(now === null ? 9 * 60 : Math.ceil(earliest / 60) * 60, earliest, open), Math.max(earliest, close - step));
  // The time "Find a free room" asks for: a tap on a free stretch of the
  // phone's list starts there too when the stretch holds it.
  const [findAt, setFindAt] = useState(preferred);
  const locked = lockedDay !== null || earliest >= close;
  const bookable = (r: GridRoom) => r.group === null || r.group.mine;
  // What an Undo answers the toast: true, or why it did not work.
  const undone = (r: Outcome<unknown>) => (r.ok ? true : r.message);
  // Each room's bookings, once (a page of 200 rooms reads them per room).
  const byRoom = useMemo(() => {
    const map = new Map<string, GridBooking[]>();
    for (const b of bookings) map.set(b.roomId, [...(map.get(b.roomId) ?? []), b]);
    return map;
  }, [bookings]);
  const takenOf = (roomId: string, except?: string) => (byRoom.get(roomId) ?? []).filter(b => b.id !== except);

  // A new booking from a slot: half an hour, or up to the next booking.
  function draftFrom(roomId: string, from: number, to?: number): Draft {
    const s = Math.max(from, earliest);
    const next = Math.min(close, ...takenOf(roomId).filter(b => b.start >= s + step).map(b => b.start));
    const e = Math.min(to ?? s + 30, next);
    return { roomId, day, start: s, end: Math.max(e, s + step), title: "", attendees: [], weekly: false, weeks: Math.min(4, maxWeeks), for: "" };
  }
  function openDraft(draft: Draft) {
    setDirty(false);
    setDialog({ mode: "new", draft });
  }
  function openNew(roomId?: string, from?: number, to?: number) {
    const room = roomId ?? rooms.find(bookable)?.id ?? rooms[0]!.id;
    const first = from ?? freeSlots(takenOf(room), open, close, Math.max(findAt, earliest))[0]?.start ?? freeSlots(takenOf(room), open, close, earliest)[0]?.start ?? earliest;
    openDraft(draftFrom(room, first, to));
  }
  const close_ = () => { setDialog(null); setDirty(false); };

  async function saveNew(d: Draft, done: (error: string | null) => void) {
    const r = await call("bookRoom", { roomId: d.roomId, day: d.day, start: d.start, end: d.end, title: d.title, attendees: d.attendees, ...(d.weekly ? { weeks: d.weeks } : {}), ...(d.for ? { for: d.for } : {}) }, { quiet: true });
    if (!r.ok) return done(r.message);
    done(null);
    close_();
    {
      const { ids, taken, roomName } = r.value;
      const said = ids.length > 1
        ? plural(t.booking.bookedWeekly, ids.length, locale, { room: roomName })
        : format(t.booking.booked, { room: roomName, when: formatDay(d.day, locale) + " " + formatSpan(d.start, d.end, locale) });
      // Undo cancels it again; its guests are told (their bell item is
      // replaced), so what they know stays true.
      toast({
        id: "room-" + ids[0],
        text: said + (taken.length ? " " + format(t.booking.skipped, { days: taken.map(x => formatDay(x, locale)).join(", ") }) : ""),
        undo: async () => undone(await call("cancelRoomBooking", { bookingId: ids[0]!, scope: ids.length > 1 ? "following" : "one" }, { quiet: true })),
      });
    }
  }

  async function saveEdit(id: string, d: Draft, done: (error: string | null) => void, scope: "one" | "following") {
    const r = await call("updateRoomBooking", { bookingId: id, roomId: d.roomId, day: d.day, start: d.start, end: d.end, title: d.title, attendees: d.attendees, scope }, { quiet: true });
    if (!r.ok) return done(r.message);
    done(null);
    close_();
    const { changed, taken } = r.value;
    toast({ id: "room-" + id, text: (scope === "following" ? plural(t.booking.changedWeekly, changed, locale) : t.booking.changed) + (taken.length ? " " + format(t.booking.skipped, { days: taken.map(x => formatDay(x, locale)).join(", ") }) : "") });
  }

  async function cancel(b: GridBooking, scope: "one" | "following") {
    close_();
    const r = await call("cancelRoomBooking", { bookingId: b.id, scope });
    if (!r.ok) return;
    // Undo puts the bookings back and invites their guests again.
    toast({
      id: "room-" + b.id,
      text: plural(t.booking.cancelled, r.value.ids.length, locale),
      undo: async () => undone(await call("restoreRoomBookings", { ids: r.value.ids }, { quiet: true })),
    });
  }

  const shownBooking = dialog && dialog.mode !== "new" ? bookings.find(b => b.id === dialog.id) ?? null : null;
  useEffect(() => {
    if (dialog && dialog.mode !== "new" && !shownBooking) setDialog(null);
  }, [dialog, shownBooking]);
  const isOver = (b: GridBooking) => lockedDay?.why === "past" || (now !== null && b.end <= now);
  const hint = lockedHint;

  return (
    <>
    <PageHeader title={head.title} intro={<span className="place-line">{head.intro}</span>} secondary={head.offices ? <OfficePicker {...head.offices} /> : undefined}
      action={<button type="button" className="button" disabled={locked || !rooms.some(bookable)} onClick={() => openNew()}><Plus />{t.rooms.book}</button>} />
    <DayPicker {...strip} />
    <div className="stack">
      {notice && <p className="hint" role="status">{notice}</p>}
      {hint
        ? <p className="hint is-locked" role="status">{hint}</p>
        : <p className="hint"><span className="on-desktop">{t.rooms.dragHint}</span><span className="on-phone">{t.rooms.tapHint}</span></p>}

      {!locked && <Finder rooms={rooms} bookings={bookings} earliest={earliest} at={findAt} setAt={setFindAt} close={close} bookable={bookable} locale={locale} t={t}
        onPick={(roomId, from, to) => openDraft(draftFrom(roomId, from, to))} />}

      <Grid rooms={rooms} byRoom={byRoom} open={open} close={close} earliest={locked ? close : earliest} now={now} bookable={bookable} locale={locale} t={t}
        onPick={(roomId, from, to) => openDraft(draftFrom(roomId, from, to))}
        onOpen={id => setDialog({ mode: "detail", id })} />

      <ul className="room-list" aria-label={t.rooms.grid}>
        {rooms.map(r => {
          const taken = takenOf(r.id);
          const slots = locked || !bookable(r) ? [] : freeSlots(taken, open, close, earliest);
          return (
            <li key={r.id} className="room-card">
              <RoomHead room={r} locale={locale} t={t} />
              {slots.length > 0 ? (
                <div className="free-slots">
                  <span className="annotation">{t.rooms.freeSlots}</span>
                  {slots.map(s => (
                    <button key={s.start} type="button" className="slot-chip" onClick={() => { const from = tapStart(s, Math.max(findAt, earliest)); openDraft(draftFrom(r.id, from, Math.min(s.end, from + 60))); }}>
                      {formatSpan(s.start, s.end, locale)}
                    </button>
                  ))}
                </div>
              ) : !locked && bookable(r) && <p className="hint">{t.rooms.fullDay}</p>}
              {taken.length > 0 && (
                <ul className="room-bookings">
                  {taken.map(b => (
                    <li key={b.id}>
                      <button type="button" className={"booking-line" + (b.mine ? " is-mine" : "")} onClick={() => setDialog({ mode: "detail", id: b.id })}>
                        <span className="mono">{formatSpan(b.start, b.end, locale)}</span>
                        <span className="grow">{b.title || t.rooms.untitled}</span>
                        <span className="muted small">{b.organiser.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={dialog !== null}
        title={dialog?.mode === "new" ? t.booking.newTitle : dialog?.mode === "edit" ? t.booking.editTitle : shownBooking?.title || t.booking.detailTitle}
        dirty={dialog?.mode !== "detail" && dirty}
        labels={t.dialog}
        onClose={close_}
      >
        {dialog?.mode === "new" && (
          <BookingForm initial={dialog.draft} isNew days={days} today={today} rooms={rooms} bookable={bookable} open={open} close={close} maxWeeks={maxWeeks} people={people} bookFor={bookFor} told={told} locale={locale} t={t}
            onDirty={setDirty} onSubmit={(d, done) => void saveNew(d, done)} />
        )}
        {dialog?.mode === "edit" && shownBooking && (
          <BookingForm initial={dialog.draft} isNew={false} days={days} today={today} rooms={rooms} bookable={bookable} open={open} close={close} maxWeeks={maxWeeks} people={people} bookFor={false} told={told} locale={locale} t={t}
            series={shownBooking.series !== null}
            onDirty={setDirty} onSubmit={(d, done, scope) => void saveEdit(shownBooking.id, d, done, scope)} />
        )}
        {dialog?.mode === "detail" && shownBooking && (
          <Detail b={shownBooking} room={rooms.find(r => r.id === shownBooking.roomId)!} day={day} over={isOver(shownBooking)} calendarPage={calendarPage} locale={locale} t={t}
            onEdit={() => { setDirty(false); setDialog({ mode: "edit", id: shownBooking.id, draft: { roomId: shownBooking.roomId, day, start: shownBooking.start, end: shownBooking.end, title: shownBooking.title, attendees: shownBooking.attendees.map(a => a.id), weekly: false, weeks: 1, for: "" } }); }}
            onCancel={scope => void cancel(shownBooking, scope)}
            onCheckIn={() => void call("checkIn", { bookingId: shownBooking.id }).then(r => { if (r.ok) toast({ id: "room-" + shownBooking.id, text: t.booking.checkedInToast }); })} />
        )}
      </Dialog>
    </div>
    </>
  );
}

// "I need a room for 6 at 14:00 for an hour": the rooms free then, big
// enough, with what was asked — one tap opens the form with that slot. On
// today it starts at the current quarter hour: the rooms free now.
function Finder({ rooms, bookings, earliest, at, setAt, close, bookable, locale, t, onPick }: {
  rooms: GridRoom[]; bookings: GridBooking[]; earliest: number; at: number; setAt: (m: number) => void; close: number; bookable: (r: GridRoom) => boolean; locale: string; t: Words;
  onPick: (roomId: string, from: number, to: number) => void;
}) {
  const biggest = Math.max(...rooms.map(r => r.capacity));
  const sizes = [1, 2, 4, 6, 8, 10, 12, 16, 20, 30, 50].filter(n => n <= biggest);
  const [size, setSize] = useState(1);
  const [length, setLength] = useState(60);
  const [wanted, setWanted] = useState<Equipment[]>([]);
  const from = Math.max(at, earliest);
  const to = Math.min(close, from + length);
  const offered = equipmentKeys.filter(e => rooms.some(r => r.equipment.includes(e)));
  const fits = rooms.filter(r => bookable(r) && r.capacity >= size && wanted.every(e => r.equipment.includes(e)));
  const busyRooms = new Set(bookings.filter(b => b.start < to && b.end > from).map(b => b.roomId));
  const free = fits.filter(r => !busyRooms.has(r.id));
  const busy = fits.length - free.length;
  const tooSmall = rooms.filter(r => bookable(r) && r.capacity < size).length;
  return (
    <section className="finder" aria-labelledby="finder-title">
      <h2 id="finder-title" className="annotation">{t.rooms.find.title}</h2>
      <div className="finder-fields">
        <label>
          <span className="label">{t.rooms.find.people}</span>
          <select className="select" value={size} onChange={e => setSize(Number(e.target.value))}>
            {sizes.map(n => <option key={n} value={n}>{n === 1 ? t.rooms.find.anySize : plural(t.rooms.find.atLeast, n, locale)}</option>)}
          </select>
        </label>
        <label>
          <span className="label">{t.rooms.find.at}</span>
          <TimeSelect value={from} min={earliest} max={close} step={step} onChange={setAt} />
        </label>
        <label>
          <span className="label">{t.rooms.find.for}</span>
          <select className="select" value={length} onChange={e => setLength(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120, 180, 240].map(n => <option key={n} value={n}>{n < 60 ? format(t.rooms.find.minutes, { count: n }) : format(t.rooms.find.hours, { count: formatNumber(n / 60, locale) })}</option>)}
          </select>
        </label>
      </div>
      {offered.length > 0 && (
        <div className="chips" role="group" aria-label={t.rooms.find.with}>
          {offered.map(e => {
            const Icon = equipmentIcons[e];
            const on = wanted.includes(e);
            return <button key={e} type="button" className="chip" aria-pressed={on} onClick={() => setWanted(on ? wanted.filter(x => x !== e) : [...wanted, e])}><Icon />{t.equipment[e]}</button>;
          })}
        </div>
      )}
      <div className="finder-results" aria-live="polite">
        {free.length === 0
          ? <p className="hint">{format(t.rooms.find.none, { span: formatSpan(from, to, locale) })}</p>
          : <>
            <span className="hint">{format(t.rooms.find.freeAt, { span: formatSpan(from, to, locale) })}</span>
            {free.map(r => (
              <button key={r.id} type="button" className="slot-chip room-chip" onClick={() => onPick(r.id, from, to)}>
                <strong>{r.name}</strong> <span className="muted">· {plural(t.rooms.capacity, r.capacity, locale)}</span>
              </button>
            ))}
          </>}
        {(busy > 0 || tooSmall > 0) && <span className="hint">{[busy > 0 ? plural(t.rooms.find.busy, busy, locale) : "", tooSmall > 0 ? plural(t.rooms.find.tooSmall, tooSmall, locale) : ""].filter(Boolean).join(" · ")}</span>}
      </div>
    </section>
  );
}

function RoomHead({ room, locale, t }: { room: GridRoom; locale: string; t: Words }) {
  return (
    <div className="room-head">
      {room.photo && <img className="room-photo" src={`/chest/files/rooms/${room.id}?size=256`} alt={format(t.rooms.photo, { room: room.name })} loading="lazy" />}
      <div>
        <h3>{room.name}</h3>
        <p className="room-meta">
          <span><Seat />{plural(t.rooms.capacity, room.capacity, locale)}</span>
          {room.equipment.map(e => { const Icon = equipmentIcons[e]; return <span key={e}><Icon />{t.equipment[e]}</span>; })}
          <span className="muted">{room.floor}</span>
          {room.group && <span className="kept"><Lock />{format(t.rooms.keptFor, { group: room.group.name })}</span>}
        </p>
      </div>
    </div>
  );
}

// The desktop grid: rooms as columns, the day's quarter hours as rows.
// Press on an empty stretch and drag down to choose a slot.
function Grid({ rooms, byRoom, open, close, earliest, now, bookable, locale, t, onPick, onOpen }: {
  rooms: GridRoom[]; byRoom: ReadonlyMap<string, GridBooking[]>; open: number; close: number; earliest: number; now: number | null; bookable: (r: GridRoom) => boolean; locale: string; t: Words;
  onPick: (roomId: string, from: number, to: number) => void; onOpen: (id: string) => void;
}) {
  const slots = (close - open) / step;
  const [drag, setDrag] = useState<{ roomId: string; anchor: number; from: number; to: number } | null>(null);
  const lanes = useRef(new Map<string, HTMLDivElement>());
  const hours = useMemo(() => Array.from({ length: (close - open) / 60 }, (_, i) => open + i * 60), [open, close]);

  // The free stretch around a slot of a room: where a drag may reach.
  function bounds(roomId: string, at: number): [number, number] {
    const taken = byRoom.get(roomId) ?? [];
    const low = Math.max(earliest, ...taken.filter(b => b.end <= at).map(b => b.end));
    const high = Math.min(close, ...taken.filter(b => b.start > at).map(b => b.start));
    return [low, high];
  }
  function slotAt(roomId: string, clientY: number): number {
    const lane = lanes.current.get(roomId)!;
    const rect = lane.getBoundingClientRect();
    const i = Math.min(slots - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * slots)));
    return open + i * step;
  }
  function down(room: GridRoom, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !bookable(room)) return;
    const at = slotAt(room.id, e.clientY);
    if (at < earliest || (byRoom.get(room.id) ?? []).some(b => b.start <= at && b.end > at)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ roomId: room.id, anchor: at, from: at, to: at + step });
  }
  function move(roomId: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.roomId !== roomId) return;
    const at = slotAt(roomId, e.clientY);
    const [low, high] = bounds(roomId, drag.anchor);
    const from = Math.max(low, Math.min(drag.anchor, at));
    const to = Math.min(high, Math.max(drag.anchor, at) + step);
    if (from !== drag.from || to !== drag.to) setDrag({ ...drag, from, to });
  }
  function up(roomId: string) {
    if (!drag || drag.roomId !== roomId) return;
    const picked = drag;
    setDrag(null);
    // A click (one quarter) becomes half an hour; a drag is what was drawn.
    onPick(roomId, picked.from, picked.to - picked.from > step ? picked.to : picked.from + 30);
  }

  // Places in the grid are classes (src/grid.css), never a style
  // attribute (the page's policy refuses them): at-N, the quarter hour a
  // thing starts at from the grid's top; len-N, how many quarters it
  // lasts; rows-N, the lanes' height. The line of "now" is set to its
  // minute once in the browser (a ref may set a style).
  const atClass = (m: number) => "at-" + Math.max(0, Math.min(slots, Math.round((m - open) / step)));
  const lenClass = (from: number, to: number) => "len-" + Math.max(1, Math.min(slots, Math.round((Math.min(to, close) - Math.max(from, open)) / step)));
  const nowLine = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (nowLine.current && now !== null) nowLine.current.style.setProperty("--at", String((now - open) / step));
  }, [now, open]);
  return (
    <div className="grid-wrap">
      <div className={"room-grid rows-" + slots}>
        <div className="grid-corner" />
        <div className="grid-hours" aria-hidden="true">
          {hours.map(h => <span key={h} className={atClass(h)}>{formatTime(h, locale)}</span>)}
        </div>
        {rooms.map(r => [
          <div key={"h" + r.id} className="grid-room"><RoomHead room={r} locale={locale} t={t} /></div>,
          <div key={"l" + r.id} className={"lane" + (bookable(r) ? "" : " is-kept")} ref={el => { if (el) lanes.current.set(r.id, el); }}
            onPointerDown={e => down(r, e)} onPointerMove={e => move(r.id, e)} onPointerUp={() => up(r.id)} onPointerCancel={() => setDrag(null)}>
            {open < earliest && <div className={"lane-past " + lenClass(open, Math.min(earliest, close))} />}
            {(byRoom.get(r.id) ?? []).map(b => (
              <button key={b.id} type="button" className={"block " + atClass(b.start) + " " + lenClass(b.start, b.end) + (b.mine ? " is-mine" : "") + (b.end - b.start <= 30 ? " is-short" : "")}
                onPointerDown={e => e.stopPropagation()} onClick={() => onOpen(b.id)}
                aria-label={`${r.name}, ${formatSpan(b.start, b.end, locale)}, ${b.title || t.rooms.untitled}, ${format(t.rooms.by, { name: b.organiser.name })}`}>
                <span className="block-time mono">{formatSpan(b.start, b.end, locale)}</span>
                <span className="block-title">{b.title || t.rooms.untitled}</span>
                <span className="block-by">{b.organiser.name}</span>
              </button>
            ))}
            {drag && drag.roomId === r.id && (
              <div className={"selection " + atClass(drag.from) + " " + lenClass(drag.from, drag.to)}>
                <span className="mono">{formatSpan(drag.from, drag.to, locale)}</span>
              </div>
            )}
          </div>,
        ])}
        {now !== null && now >= open && now <= close && <div ref={nowLine} className={"now-line " + atClass(now)}><span>{formatTime(now, locale)}</span></div>}
      </div>
    </div>
  );
}

function Detail({ b, room, day, over, calendarPage, locale, t, onEdit, onCancel, onCheckIn }: { b: GridBooking; room: GridRoom; day: string; over: boolean; calendarPage: string | null; locale: string; t: Words; onEdit: () => void; onCancel: (scope: "one" | "following") => void; onCheckIn: () => void }) {
  return (
    <div className="stack">
      <RoomHead room={room} locale={locale} t={t} />
      <p className="detail-when"><strong>{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</strong> <span className="mono">{formatSpan(b.start, b.end, locale)}</span>{b.series && <span className="tag"><Repeat />{t.booking.weekly}</span>}{b.checkedIn && <span className="tag quiet"><Check />{t.booking.checkedIn}</span>}</p>
      {b.checkable && <button type="button" className="button" onClick={onCheckIn}><Check />{t.booking.checkIn}</button>}
      {room.note && <p className="hint">{room.note}</p>}
      <dl className="facts">
        <dt>{t.booking.organiser}</dt>
        <dd><span className="person"><Avatar name={b.organiser.name} photo={b.organiser.photo} size="s" />{b.organiser.name}</span></dd>
        {b.attendees.length > 0 && <>
          <dt>{t.booking.attendees}</dt>
          <dd className="people-line">{b.attendees.map(a => <span key={a.id} className="person"><Avatar name={a.name} photo={a.photo} size="s" />{a.name}</span>)}</dd>
        </>}
      </dl>
      <div className="row calendar-row">
        <a className="button quiet small" href={`/chest/calendar/room/${b.id}`} download><CalendarAdd />{t.booking.addToCalendar}</a>
        {b.mine && calendarPage && <span className="hint">{t.booking.inCalendar} <a href={calendarPage}>{t.booking.calendarHow}</a></span>}
      </div>
      {b.canChange && !over && (
        <div className="row actions">
          <button type="button" className="button" onClick={onEdit}>{t.booking.change}</button>
          {b.series ? (
            <>
              <button type="button" className="button quiet danger" onClick={() => onCancel("one")}>{t.booking.cancelOne}</button>
              <button type="button" className="button quiet danger" onClick={() => onCancel("following")}>{t.booking.cancelFollowing}</button>
            </>
          ) : (
            <button type="button" className="button quiet danger" onClick={() => onCancel("one")}>{t.booking.cancel}</button>
          )}
        </div>
      )}
    </div>
  );
}

function BookingForm({ initial, isNew, series = false, days, today, rooms, bookable, open, close, maxWeeks, people, bookFor, told, locale, t, onDirty, onSubmit }: {
  initial: Draft; isNew: boolean; days: { value: string; label: string }[]; today: string; rooms: GridRoom[]; bookable: (r: GridRoom) => boolean; open: number; close: number; maxWeeks: number; people: Person[]; bookFor: boolean; told: "bell" | "calendar" | "mail"; locale: string; t: Words;
  onDirty: (dirty: boolean) => void;
  // A weekly booking's occurrence: saved alone, or with the next ones.
  series?: boolean;
  onSubmit: (d: Draft, done: (error: string | null) => void, scope: "one" | "following") => void;
}) {
  const [d, setDraft] = useState(initial);
  const scope = useRef<"one" | "following">("one");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whatever was typed or chosen: closing the form now asks first.
  const setD = (next: Draft) => { setDraft(next); onDirty(true); };
  const named = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const personOf = (id: string) => named.get(id) ?? { id, name: id, photo: null };
  const chosen = d.attendees.map(personOf);
  // The kit's picker searches the team the page holds (accents and case
  // aside, any word of the name); neither the organiser nor the person
  // booked for is offered as a guest.
  const findGuest = useMemo(() => localSearch(people, { exclude: [...d.attendees, d.for].filter(Boolean) }), [people, d.attendees, d.for]);
  const findPerson = useMemo(() => localSearch(people), [people]);
  // The day is the kit's DateField (typed "tomorrow", "12/10" or picked),
  // bounded by the days one may book; a closed day is said at once.
  const lastDay = days.at(-1)?.value ?? d.day;
  const closedDay = d.day !== initial.day && d.day >= today && d.day <= lastDay && !days.some(x => x.value === d.day);
  // A day the field refused (before today, past the last bookable day,
  // unreadable) leaves the previous day in the draft: booking waits, on
  // the field and its sentence, rather than book that day in its place.
  const dates = useDateProblems();
  // Booking for someone else is rare: a link under the booking itself.
  const [forOpen, setForOpen] = useState(Boolean(initial.for));
  const titleLength = [...d.title].length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (dates.problem) {
      document.getElementById("booking-day")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    onSubmit(d, message => {
      setBusy(false);
      if (message) setError(message);
    }, scope.current);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2">
          <span className="label">{t.booking.room}</span>
          <select className="select" value={d.roomId} onChange={e => setD({ ...d, roomId: e.target.value })}>
            {rooms.map(r => <option key={r.id} value={r.id} disabled={!bookable(r)}>{r.name} · {plural(t.rooms.capacity, r.capacity, locale)}{r.group ? " · " + format(t.rooms.keptFor, { group: r.group.name }) : ""}</option>)}
          </select>
        </label>
        <div className="span-2">
          <WatchedDateField id="booking-day" label={t.booking.day} value={d.day} onProblem={dates.watch("booking-day")} today={today} min={today} max={lastDay} required labels={t.date}
            {...(closedDay ? { error: t.closedDay } : {})}
            onChange={v => { if (v) setD({ ...d, day: v }); }} />
        </div>
        {/* A 24-hour list every quarter hour (the kit's TimeSelect); moving
            the start keeps the length chosen, the end never passes it. */}
        <label>
          <span className="label">{t.booking.from}</span>
          <TimeSelect value={d.start} min={open} max={close} step={step} onChange={s => setD({ ...d, ...moveStart(d, s, { step, max: close }) })} />
        </label>
        <label>
          <span className="label">{t.booking.to}</span>
          <TimeSelect value={d.end} min={d.start} max={close} step={step} end onChange={e => setD({ ...d, ...moveEnd(d, e, { step }) })} />
        </label>
        <label className="span-4">
          <span className="label">{t.booking.title}</span>
          <input className="field" value={d.title} maxLength={limits.title} placeholder={t.booking.titlePlaceholder} onChange={e => setD({ ...d, title: e.target.value })} aria-describedby={titleLength >= limits.title - 20 ? "title-count" : undefined} />
          {titleLength >= limits.title - 20 && <span id="title-count" className="hint counter">{format(t.booking.count, { count: titleLength, max: limits.title })}</span>}
        </label>
      </div>
      {bookFor && isNew && (forOpen ? (
        <PeoplePicker label={t.booking.for} hint={t.booking.forHint} clearable value={d.for ? [personOf(d.for)] : []} search={findPerson} labels={t.peoplePicker} lang={locale}
          onChange={v => { const id = v[0]?.id ?? ""; setD({ ...d, for: id, attendees: d.attendees.filter(a => a !== id) }); }} />
      ) : (
        <button type="button" className="link-button for-link" onClick={() => setForOpen(true)}>{t.booking.forOpen}</button>
      ))}
      <PeoplePicker label={t.booking.people} multiple value={chosen} search={findGuest} hint={t.booking.peopleHint[told]} labels={t.peoplePicker} lang={locale}
        onChange={v => setD({ ...d, attendees: v.map(p => p.id) })} />
      {isNew && (
        <div className="repeat">
          <label className="check">
            <input type="checkbox" checked={d.weekly} onChange={e => setD({ ...d, weekly: e.target.checked })} />
            <Repeat />{format(t.booking.repeat, { weekday: formatDay(d.day, locale, { weekday: "long" }) })}
          </label>
          {d.weekly && (
            <label className="repeat-weeks">
              <span className="label">{t.booking.weeks}</span>
              <input className="field" type="number" min={2} max={maxWeeks} value={d.weeks} onChange={e => setD({ ...d, weeks: Math.max(2, Math.min(maxWeeks, Number(e.target.value) || 2)) })} />
              <span className="hint">{format(t.booking.until, { date: formatDay(addDays(d.day, 7 * (d.weeks - 1)), locale, { day: "numeric", month: "long" }), max: maxWeeks })}</span>
            </label>
          )}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="submit" className="button" disabled={busy} onClick={() => { scope.current = "one"; }}>{busy ? t.booking.saving : isNew ? t.booking.save : t.booking.saveChanges}</button>
        {series && !isNew && <button type="submit" className="button quiet" disabled={busy} onClick={() => { scope.current = "following"; }}><Repeat />{t.booking.saveFollowing}</button>}
      </div>
    </form>
  );
}
