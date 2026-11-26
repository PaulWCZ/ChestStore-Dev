import { useState } from "react";
import { CalendarOff } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

// Cancelling a meeting: one click opens a word for the guest, a second
// confirms (the guest is told at once — an email, or their page —: there
// is no undo).
export function CancelMeeting({ id, guest, t }: { id: string; guest: string; t: { booking: Catalogue["booking"] } }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><CalendarOff />{t.booking.cancel}</button>;
  return (
    <form className="stack" onSubmit={async e => {
      e.preventDefault();
      setPending(true);
      const r = await call("cancelBooking", { id, reason });
      setPending(false);
      if (!r.ok) return;
      toast({ id: `cancel-${id}`, text: format(r.value.delivery === "email" ? t.booking.cancelledToast : t.booking.cancelledToastPage, { name: guest }), sent: true });
    }}>
      <div>
        <label className="label" htmlFor="reason">{format(t.booking.cancelReason, { name: guest })}</label>
        <textarea id="reason" className="field" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
      </div>
      <div className="row">
        <button type="submit" className="button danger" disabled={pending}>{t.booking.cancelConfirm}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.booking.keep}</button>
      </div>
    </form>
  );
}
