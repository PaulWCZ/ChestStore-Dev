"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ComponentType, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Dialog } from "../../../components/dialog.tsx";
import { Accessible, Close, Phone, Plus, Repeat, Screen, Seat, Video, Whiteboard } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay, formatSpan, formatTime, plural } from "../../../lib/i18n/format.ts";
import { addDays, freeSlots, step, type Equipment } from "../../../lib/model.ts";
import { bookRoom, cancelRoomBooking, restoreRoomBookings, updateRoomBooking } from "../actions.ts";

export type GridRoom = { id: string; name: string; capacity: number; equipment: Equipment[]; note: string; photo: boolean; floor: string };
type Person = { id: string; name: string; photo: string | null };
export type GridBooking = { id: string; roomId: string; start: number; end: number; title: string; series: string | null; organiser: Person; attendees: Person[]; mine: boolean; canChange: boolean };
type Words = { rooms: Catalogue["rooms"]; booking: Catalogue["booking"]; equipment: Catalogue["equipment"]; errors: Catalogue["errors"] };
type Draft = { roomId: string; day: string; start: number; end: number; title: string; attendees: string[]; weekly: boolean; weeks: number };
type Open = { mode: "new"; draft: Draft } | { mode: "detail"; id: string } | { mode: "edit"; id: string; draft: Draft } | null;

export const equipmentIcons: Record<Equipment, ComponentType> = { screen: Screen, video: Video, whiteboard: Whiteboard, phone: Phone, accessible: Accessible };

export function RoomsView({ day, today, now, past, closed, open, close, maxWeeks, rooms, bookings, people, initial, locale, t }: {
  day: string;
  today: string;
  now: number | null;
  past: boolean;
  closed: boolean;
  open: number;
  close: number;
  maxWeeks: number;
  rooms: GridRoom[];
  bookings: GridBooking[];
  people: Person[];
  initial: string | null;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [dialog, setDialog] = useState<Open>(initial ? { mode: "detail", id: initial } : null);
  // The earliest a new booking may start: now's quarter on today.
  const earliest = now === null ? open : Math.max(open, Math.floor(now / step) * step);
  const locked = past || closed || earliest >= close;
  const fail = (error: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[error], values));
  const takenOf = (roomId: string, except?: string) => bookings.filter(b => b.roomId === roomId && b.id !== except);

  // A new booking from a slot: half an hour, or up to the next booking.
  function draftFrom(roomId: string, from: number, to?: number): Draft {
    const s = Math.max(from, earliest);
    const next = Math.min(close, ...takenOf(roomId).filter(b => b.start >= s + step).map(b => b.start));
    const e = Math.min(to ?? s + 30, next);
    return { roomId, day, start: s, end: Math.max(e, s + step), title: "", attendees: [], weekly: false, weeks: Math.min(4, maxWeeks) };
  }
  function openNew(roomId?: string, from?: number, to?: number) {
    const room = roomId ?? rooms[0]!.id;
    const first = from ?? freeSlots(takenOf(room), open, close, earliest)[0]?.start ?? earliest;
    setDialog({ mode: "new", draft: draftFrom(room, first, to) });
  }

  function saveNew(d: Draft, done: (error: keyof Catalogue["errors"] | null, values?: Record<string, string | number>) => void) {
    start(async () => {
      const r = await bookRoom({ roomId: d.roomId, day: d.day, start: d.start, end: d.end, title: d.title, attendees: d.attendees, ...(d.weekly ? { weeks: d.weeks } : {}) });
      if (!r.ok) return done(r.error, r.values);
      done(null);
      setDialog(null);
      const { ids, taken, roomName } = r.value;
      const said = ids.length > 1
        ? plural(t.booking.bookedWeekly, ids.length, locale, { room: roomName })
        : format(t.booking.booked, { room: roomName, when: formatDay(d.day, locale) + " " + formatSpan(d.start, d.end, locale) });
      toast(said + (taken.length ? " " + format(t.booking.skipped, { days: taken.map(x => formatDay(x, locale)).join(", ") }) : ""), {
        label: t.booking.undo,
        run: () => start(async () => {
          const back = await cancelRoomBooking(ids[0]!, ids.length > 1 ? "following" : "one");
          if (!back.ok) fail(back.error, back.values);
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  function saveEdit(id: string, d: Draft, done: (error: keyof Catalogue["errors"] | null, values?: Record<string, string | number>) => void) {
    start(async () => {
      const r = await updateRoomBooking(id, { roomId: d.roomId, day: d.day, start: d.start, end: d.end, title: d.title, attendees: d.attendees });
      if (!r.ok) return done(r.error, r.values);
      done(null);
      setDialog(null);
      toast(t.booking.changed);
      router.refresh();
    });
  }

  function cancel(b: GridBooking, scope: "one" | "following") {
    setDialog(null);
    start(async () => {
      const r = await cancelRoomBooking(b.id, scope);
      if (!r.ok) return fail(r.error, r.values);
      toast(plural(t.booking.cancelled, r.value.ids.length, locale), {
        label: t.booking.undo,
        run: () => start(async () => {
          const back = await restoreRoomBookings(r.value.ids);
          if (!back.ok) fail(back.error, back.values);
          else toast(t.booking.restored);
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  const shownBooking = dialog && dialog.mode !== "new" ? bookings.find(b => b.id === dialog.id) ?? null : null;
  useEffect(() => {
    if (dialog && dialog.mode !== "new" && !shownBooking) setDialog(null);
  }, [dialog, shownBooking]);
  const isOver = (b: GridBooking) => past || (now !== null && b.end <= now);

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className="button" disabled={locked} onClick={() => openNew()}><Plus />{t.rooms.book}</button>
        <p className="hint">{closed ? t.rooms.closedDay : past ? t.errors.past : t.rooms.dragHint}</p>
      </div>

      <Grid rooms={rooms} bookings={bookings} open={open} close={close} earliest={locked ? close : earliest} now={now} locale={locale} t={t}
        onPick={(roomId, from, to) => setDialog({ mode: "new", draft: draftFrom(roomId, from, to) })}
        onOpen={id => setDialog({ mode: "detail", id })} />

      <ul className="room-list" aria-label={t.rooms.grid}>
        {rooms.map(r => {
          const taken = takenOf(r.id);
          const slots = locked ? [] : freeSlots(taken, open, close, earliest);
          return (
            <li key={r.id} className="room-card">
              <RoomHead room={r} locale={locale} t={t} />
              {slots.length > 0 ? (
                <div className="free-slots">
                  <span className="annotation">{t.rooms.freeSlots}</span>
                  {slots.map(s => (
                    <button key={s.start} type="button" className="slot-chip" onClick={() => setDialog({ mode: "new", draft: draftFrom(r.id, s.start, Math.min(s.end, s.start + 60)) })}>
                      {formatSpan(s.start, s.end, locale)}
                    </button>
                  ))}
                </div>
              ) : !locked && <p className="hint">{t.rooms.fullDay}</p>}
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
        closeLabel={t.booking.close}
        onClose={() => setDialog(null)}
      >
        {dialog?.mode === "new" && (
          <BookingForm initial={dialog.draft} isNew today={today} rooms={rooms} open={open} close={close} maxWeeks={maxWeeks} people={people} locale={locale} t={t}
            onSubmit={saveNew} />
        )}
        {dialog?.mode === "edit" && shownBooking && (
          <BookingForm initial={dialog.draft} isNew={false} today={today} rooms={rooms} open={open} close={close} maxWeeks={maxWeeks} people={people} locale={locale} t={t}
            onSubmit={(d, done) => saveEdit(shownBooking.id, d, done)} />
        )}
        {dialog?.mode === "detail" && shownBooking && (
          <Detail b={shownBooking} room={rooms.find(r => r.id === shownBooking.roomId)!} day={day} over={isOver(shownBooking)} locale={locale} t={t}
            onEdit={() => setDialog({ mode: "edit", id: shownBooking.id, draft: { roomId: shownBooking.roomId, day, start: shownBooking.start, end: shownBooking.end, title: shownBooking.title, attendees: shownBooking.attendees.map(a => a.id), weekly: false, weeks: 1 } })}
            onCancel={scope => cancel(shownBooking, scope)} />
        )}
      </Dialog>
    </div>
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
          {room.equipment.map(e => { const Icon = equipmentIcons[e]; return <span key={e} title={t.equipment[e]}><Icon /><span className="visually-hidden">{t.equipment[e]}</span></span>; })}
          <span className="muted">{room.floor}</span>
        </p>
      </div>
    </div>
  );
}

// The desktop grid: rooms as columns, the day's quarter hours as rows.
// Press on an empty stretch and drag down to choose a slot.
function Grid({ rooms, bookings, open, close, earliest, now, locale, t, onPick, onOpen }: {
  rooms: GridRoom[]; bookings: GridBooking[]; open: number; close: number; earliest: number; now: number | null; locale: string; t: Words;
  onPick: (roomId: string, from: number, to: number) => void; onOpen: (id: string) => void;
}) {
  const slots = (close - open) / step;
  const [drag, setDrag] = useState<{ roomId: string; anchor: number; from: number; to: number } | null>(null);
  const lanes = useRef(new Map<string, HTMLDivElement>());
  const hours = useMemo(() => Array.from({ length: (close - open) / 60 }, (_, i) => open + i * 60), [open, close]);

  // The free stretch around a slot of a room: where a drag may reach.
  function bounds(roomId: string, at: number): [number, number] {
    const taken = bookings.filter(b => b.roomId === roomId);
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
  function down(roomId: string, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const at = slotAt(roomId, e.clientY);
    if (at < earliest || bookings.some(b => b.roomId === roomId && b.start <= at && b.end > at)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ roomId, anchor: at, from: at, to: at + step });
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

  const top = (m: number) => `calc(${(m - open) / step} * var(--slot))`;
  return (
    <div className="grid-wrap">
      <div className="room-grid" style={{ ["--rooms" as string]: rooms.length, ["--rows" as string]: slots }}>
        <div className="grid-corner" />
        {rooms.map(r => <div key={r.id} className="grid-room"><RoomHead room={r} locale={locale} t={t} /></div>)}
        <div className="grid-hours" aria-hidden="true">
          {hours.map(h => <span key={h} style={{ top: top(h) }}>{formatTime(h, locale)}</span>)}
        </div>
        {rooms.map(r => (
          <div key={r.id} className="lane" ref={el => { if (el) lanes.current.set(r.id, el); }}
            onPointerDown={e => down(r.id, e)} onPointerMove={e => move(r.id, e)} onPointerUp={() => up(r.id)} onPointerCancel={() => setDrag(null)}>
            {open < earliest && <div className="lane-past" style={{ height: top(Math.min(earliest, close)) }} />}
            {bookings.filter(b => b.roomId === r.id).map(b => (
              <button key={b.id} type="button" className={"block" + (b.mine ? " is-mine" : "") + (b.end - b.start <= 30 ? " is-short" : "")}
                style={{ top: top(b.start), height: `calc(${(b.end - b.start) / step} * var(--slot) - 2px)` }}
                onPointerDown={e => e.stopPropagation()} onClick={() => onOpen(b.id)}
                aria-label={`${r.name}, ${formatSpan(b.start, b.end, locale)}, ${b.title || t.rooms.untitled}, ${format(t.rooms.by, { name: b.organiser.name })}`}>
                <span className="block-time mono">{formatSpan(b.start, b.end, locale)}</span>
                <span className="block-title">{b.title || t.rooms.untitled}</span>
                <span className="block-by">{b.organiser.name}</span>
              </button>
            ))}
            {drag && drag.roomId === r.id && (
              <div className="selection" style={{ top: top(drag.from), height: `calc(${(drag.to - drag.from) / step} * var(--slot))` }}>
                <span className="mono">{formatSpan(drag.from, drag.to, locale)}</span>
              </div>
            )}
          </div>
        ))}
        {now !== null && now >= open && now <= close && <div className="now-line" style={{ top: `calc(var(--head) + ${top(now)})` }}><span>{formatTime(now, locale)}</span></div>}
      </div>
    </div>
  );
}

function Detail({ b, room, day, over, locale, t, onEdit, onCancel }: { b: GridBooking; room: GridRoom; day: string; over: boolean; locale: string; t: Words; onEdit: () => void; onCancel: (scope: "one" | "following") => void }) {
  return (
    <div className="stack">
      <RoomHead room={room} locale={locale} t={t} />
      <p className="detail-when"><strong>{formatDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</strong> <span className="mono">{formatSpan(b.start, b.end, locale)}</span>{b.series && <span className="tag"><Repeat />{t.booking.weekly}</span>}</p>
      {room.note && <p className="hint">{room.note}</p>}
      <dl className="facts">
        <dt>{t.booking.organiser}</dt>
        <dd><span className="person"><Avatar name={b.organiser.name} photo={b.organiser.photo} size={24} />{b.organiser.name}</span></dd>
        {b.attendees.length > 0 && <>
          <dt>{t.booking.attendees}</dt>
          <dd className="people-line">{b.attendees.map(a => <span key={a.id} className="person"><Avatar name={a.name} photo={a.photo} size={24} />{a.name}</span>)}</dd>
        </>}
      </dl>
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

function BookingForm({ initial, isNew, today, rooms, open, close, maxWeeks, people, locale, t, onSubmit }: {
  initial: Draft; isNew: boolean; today: string; rooms: GridRoom[]; open: number; close: number; maxWeeks: number; people: Person[]; locale: string; t: Words;
  onSubmit: (d: Draft, done: (error: keyof Catalogue["errors"] | null, values?: Record<string, string | number>) => void) => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const times = useMemo(() => Array.from({ length: (close - open) / step + 1 }, (_, i) => open + i * step), [open, close]);
  const chosen = d.attendees.map(id => people.find(p => p.id === id) ?? { id, name: id, photo: null });
  const found = q.trim().length === 0 ? [] : people.filter(p => !d.attendees.includes(p.id) && p.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/u).some(w => w.startsWith(q.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()))).slice(0, 6);

  function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    onSubmit(d, (code, values) => {
      setBusy(false);
      if (code) setError(format(t.errors[code], values));
    });
  }
  const add = (id: string) => { setD({ ...d, attendees: [...d.attendees, id] }); setQ(""); };

  return (
    <form className="stack booking-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2">
          <span className="label">{t.booking.room}</span>
          <select className="select" value={d.roomId} onChange={e => setD({ ...d, roomId: e.target.value })}>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {plural(t.rooms.capacity, r.capacity, locale)}</option>)}
          </select>
        </label>
        <label className="span-2">
          <span className="label">{t.booking.day}</span>
          <input className="field" type="date" value={d.day} min={today} required onChange={e => setD({ ...d, day: e.target.value || d.day })} />
        </label>
        <label>
          <span className="label">{t.booking.from}</span>
          <select className="select" value={d.start} onChange={e => { const s = Number(e.target.value); setD({ ...d, start: s, end: Math.max(d.end, s + step) }); }}>
            {times.slice(0, -1).map(m => <option key={m} value={m}>{formatTime(m, locale)}</option>)}
          </select>
        </label>
        <label>
          <span className="label">{t.booking.to}</span>
          <select className="select" value={d.end} onChange={e => setD({ ...d, end: Number(e.target.value) })}>
            {times.filter(m => m > d.start).map(m => <option key={m} value={m}>{formatTime(m, locale)}</option>)}
          </select>
        </label>
        <label className="span-4">
          <span className="label">{t.booking.title}</span>
          <input className="field" value={d.title} maxLength={120} placeholder={t.booking.titlePlaceholder} onChange={e => setD({ ...d, title: e.target.value })} />
        </label>
      </div>
      <div className="stack-s">
        <label htmlFor="find-people" className="label">{t.booking.people}</label>
        {chosen.length > 0 && (
          <ul className="picked">
            {chosen.map(p => (
              <li key={p.id} className="person-chip">
                <Avatar name={p.name} photo={p.photo} size={22} />{p.name}
                <button type="button" className="icon-button small" onClick={() => setD({ ...d, attendees: d.attendees.filter(a => a !== p.id) })}><Close /><span className="visually-hidden">{format(t.booking.remove, { name: p.name })}</span></button>
              </li>
            ))}
          </ul>
        )}
        <input id="find-people" className="field" type="search" value={q} placeholder={t.booking.findPeople} autoComplete="off"
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && found[0]) { e.preventDefault(); add(found[0].id); } }} />
        {q.trim() && (
          <ul className="suggestions" role="list">
            {found.length === 0 ? <li className="hint">{t.booking.noMatch}</li> : found.map(p => (
              <li key={p.id}><button type="button" className="suggestion" onClick={() => add(p.id)}><Avatar name={p.name} photo={p.photo} size={24} />{p.name}</button></li>
            ))}
          </ul>
        )}
        <p className="hint">{t.booking.peopleHint}</p>
      </div>
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
        <button type="submit" className="button" disabled={busy}>{busy ? t.booking.saving : isNew ? t.booking.save : t.booking.saveChanges}</button>
      </div>
    </form>
  );
}
