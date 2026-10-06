import { DateField, Dialog, Switch, TimeSelect } from "@argentic/chest-ui/components";
import { moveEnd, moveStart, type DateWords, type DialogWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useState } from "react";
import { Alert } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";

// Blocking a time from the agenda: tap a free stretch ("Free 14:00–17:30")
// or "Block a time", pick the hours, done. A blocked time is freed again
// with one tap, with Undo. The everyday act, where the host looks.
//
// One island for the whole agenda (src/pages/Agenda.tsx): the page's own
// buttons say what they ask as data — data-block (a day and its hours) and
// data-unblock (a blocked time) — and this island listens for them on the
// page, so a long agenda costs no script per row, and its rows stay plain
// HTML that refresh() puts in place.
type Words = { hours: Catalogue["hours"]; bookings: Catalogue["bookings"]; date: DateWords; dialog: DialogWords; invalid: string };
type Asked = { day: string; start: number; end: number };
type Blocked = Asked & { id: string; note: string };

const parse = <T,>(text: string | undefined): T | null => {
  try {
    return text ? JSON.parse(text) as T : null;
  } catch {
    return null;
  }
};

// today: the host's date (their time zone), written by the server.
export function AgendaTools({ today, t }: { today: string; t: Words }) {
  const h = t.hours;
  const b = t.bookings;
  const [asked, setAsked] = useState<Asked | null>(null);
  const [day, setDay] = useState<string | null>(today);
  const [slot, setSlot] = useState({ start: 600, end: 660 });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const block = async (input: Asked & { note: string }) => call("blockTime", { day: input.day, from: input.start, to: input.end, note: input.note }, { quiet: true });
  const unblock = async (target: Blocked, button: HTMLButtonElement) => {
    button.disabled = true;
    const r = await call("unblock", { id: target.id });
    button.disabled = false;
    if (!r.ok) return;
    toast({ id: `unblock-${target.id}`, text: b.unblocked, undo: async () => { const again = await block(target); return again.ok ? true : again.message; } });
  };

  // The page's buttons, whatever refresh() puts in place.
  useEffect(() => {
    const listen = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-block], button[data-unblock]") : null;
      if (!button) return;
      const wanted = parse<Asked>(button.dataset["block"]);
      if (wanted) {
        setAsked(wanted);
        setDay(wanted.day);
        setSlot({ start: wanted.start, end: wanted.end });
        setNote("");
        setError(null);
        return;
      }
      const target = parse<Blocked>(button.dataset["unblock"]);
      if (target) void unblock(target, button);
    };
    document.addEventListener("click", listen);
    return () => document.removeEventListener("click", listen);
  });

  const close = () => setAsked(null);
  const submit = async () => {
    if (!day) return setError(t.invalid);
    setPending(true);
    const r = await block({ day, start: slot.start, end: slot.end, note });
    setPending(false);
    if (!r.ok) return setError(r.message);
    close();
    const id = r.value;
    toast({ id: `block-${id}`, text: h.blockedToast, undo: async () => { const freed = await call("unblock", { id }, { quiet: true }); return freed.ok ? true : freed.message; } });
  };
  return (
    <Dialog open={asked !== null} title={h.blockTitle} description={h.blockHint} onClose={close} dirty={note !== ""} labels={t.dialog} size="s"
      footer={<>
        <button type="button" className="button quiet" onClick={close}>{h.cancel}</button>
        <button type="submit" form="block-form" className="button" disabled={pending}>{h.blockButton}</button>
      </>}>
      <form id="block-form" className="stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <DateField id="bl-day" label={h.day} value={day} onChange={setDay} today={today} min={today} required labels={t.date} />
        <div className="inline">
          <div><label className="label" htmlFor="bl-from">{h.from}</label><TimeSelect id="bl-from" value={slot.start} onChange={s => setSlot(moveStart(slot, s))} /></div>
          <div><label className="label" htmlFor="bl-to">{h.to}</label><TimeSelect id="bl-to" value={slot.end} onChange={e => setSlot(moveEnd(slot, e))} end /></div>
        </div>
        <div><label className="label" htmlFor="bl-note">{h.note}</label><input id="bl-note" className="field" maxLength={80} value={note} onChange={e => setNote(e.target.value)} placeholder={h.notePlaceholder} /></div>
        {error && <p className="error" role="alert"><Alert />{error}</p>}
      </form>
    </Dialog>
  );
}

// "Show free times" on a phone: the agenda's free stretches and busy rows
// fold away behind it (src/styles.css reads the switch's state), and the
// choice is remembered on this device. A computer shows them all.
export function FreeToggle({ label }: { label: string }) {
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
  return <Switch className="free-toggle" label={label} checked={show} onChange={change} />;
}
