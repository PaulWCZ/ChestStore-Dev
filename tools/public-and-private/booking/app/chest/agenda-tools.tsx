"use client";

import { DateField, Dialog, Switch, TimeSelect, useToast } from "@argentic/chest-ui/components";
import { moveEnd, moveStart, timeText } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { Alert, CalendarOff, Plus } from "../../components/icons.tsx";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { dateWords } from "../../lib/i18n/kit.ts";
import { blockTime, unblock } from "./actions.ts";

// Blocking a time from the agenda: tap a free stretch ("Free 14:00–17:30")
// or "Block a time", pick the hours, done. A blocked time is freed again
// with one tap, with Undo. The everyday act, where the host looks.

type Words = { hours: Catalogue["hours"]; bookings: Catalogue["bookings"]; errors: Catalogue["errors"]; date: Catalogue["date"]; dialog: Catalogue["dialog"] };
type Asked = { day: string; start: number; end: number };
const Ask = createContext<(asked: Asked) => void>(() => {});

// today: the host's date (their time zone), written by the server.
export function BlockProvider({ today, t, children }: { today: string; t: Words; children: ReactNode }) {
  const h = t.hours;
  const [asked, setAsked] = useState<Asked | null>(null);
  const [day, setDay] = useState<string | null>(today);
  const [slot, setSlot] = useState({ start: 600, end: 660 });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const open = (a: Asked) => {
    setAsked(a);
    setDay(a.day);
    setSlot({ start: a.start, end: a.end });
    setNote("");
    setError(null);
  };
  const close = () => setAsked(null);
  const submit = () => {
    if (!day) return setError(t.errors.invalid);
    start(async () => {
      const r = await blockTime(day, slot.start, slot.end, note);
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      close();
      toast({ id: `block-${r.value}`, text: h.blockedToast, undo: async () => (await unblock(r.value)).ok ? (router.refresh(), true) : t.errors.unknown });
      router.refresh();
    });
  };
  return (
    <Ask.Provider value={open}>
      {children}
      <Dialog open={asked !== null} title={h.blockTitle} description={h.blockHint} onClose={close} dirty={note !== ""} labels={t.dialog} size="s"
        footer={<>
          <button type="button" className="button quiet" onClick={close}>{h.cancel}</button>
          <button type="submit" form="block-form" className="button" disabled={pending}>{h.blockButton}</button>
        </>}>
        <form id="block-form" className="stack" onSubmit={e => { e.preventDefault(); submit(); }}>
          <DateField id="bl-day" label={h.day} value={day} onChange={setDay} today={today} min={today} required labels={dateWords(t)} />
          <div className="inline">
            <div><label className="label" htmlFor="bl-from">{h.from}</label><TimeSelect id="bl-from" value={slot.start} onChange={s => setSlot(moveStart(slot, s))} /></div>
            <div><label className="label" htmlFor="bl-to">{h.to}</label><TimeSelect id="bl-to" value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end /></div>
          </div>
          <div><label className="label" htmlFor="bl-note">{h.note}</label><input id="bl-note" className="field" maxLength={80} value={note} onChange={e => setNote(e.target.value)} placeholder={h.notePlaceholder} /></div>
          {error && <p className="error" role="alert"><Alert />{error}</p>}
        </form>
      </Dialog>
    </Ask.Provider>
  );
}

// "Block a time" beside "New booking": today, the next hour.
export function BlockButton({ today, label }: { today: string; label: string }) {
  const ask = useContext(Ask);
  return <button type="button" className="button quiet small" onClick={() => ask({ day: today, start: 600, end: 660 })}><CalendarOff />{label}</button>;
}

// A free stretch of a day on the agenda: tap it to block (the dialog opens
// on its first hour, never past its end).
export function FreeStretch({ day, start, end, t }: { day: string; start: number; end: number; t: Pick<Words, "bookings"> }) {
  const ask = useContext(Ask);
  const b = t.bookings;
  const range = `${timeText(start)}–${timeText(end)}`;
  return (
    <button type="button" className="meeting free" onClick={() => ask({ day, start, end: Math.min(end, start + 60) })} aria-label={format(b.freeLabel, { range })}>
      <span className="time num">{timeText(start)}<small>{timeText(end)}</small></span>
      <span className="who-line">{b.free}</span>
      <span className="row"><span className="tag"><Plus />{b.block}</span></span>
    </button>
  );
}

// A time the host blocked: freed with one tap, with Undo (it is blocked
// again as it was).
export function BlockedTime({ id, day, start, end, note, label, t }: { id: string; day: string; start: number; end: number; note: string; label: string; t: Pick<Words, "bookings" | "errors"> }) {
  const b = t.bookings;
  const [pending, run] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="meeting blocked">
      <span className="time num">{timeText(start)}<small>{timeText(end)}</small></span>
      <span>
        <span className="who-line">{b.blocked}</span>
        {note && <span className="what">{note}</span>}
      </span>
      <span className="row">
        <button type="button" className="link-button" disabled={pending} aria-label={format(b.unblockLabel, { time: label })} onClick={() => run(async () => {
          const r = await unblock(id);
          if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
          toast({ id: `unblock-${id}`, text: b.unblocked, undo: async () => (await blockTime(day, start, end, note)).ok ? (router.refresh(), true) : t.errors.unknown });
          router.refresh();
        })}>{b.unblock}</button>
      </span>
    </div>
  );
}

// The agenda's days. On a phone, where meetings are the main thing, the
// free stretches (and the busy times of other calendars beside them) fold
// away behind "Show free times" — remembered on this device; a computer
// shows them all (app/globals.css).
export function AgendaDays({ label, toggle, children }: { label: string; toggle: boolean; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem("booking.showFree") === "1");
    } catch {
      // No storage (a private window): folded, as at first.
    }
  }, []);
  const change = (on: boolean) => {
    setShow(on);
    try {
      window.localStorage.setItem("booking.showFree", on ? "1" : "0");
    } catch {
      // Remembered for this visit only.
    }
  };
  return (
    <>
      {toggle && <Switch className="free-toggle" label={label} checked={show} onChange={change} />}
      <div className={`agenda${show ? " show-free" : ""}`}>{children}</div>
    </>
  );
}
