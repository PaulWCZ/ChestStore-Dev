"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarOff } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { cancelBooking } from "../../actions.ts";

// Cancelling a meeting: one click opens a word for the guest, a second
// confirms (the guest is emailed: there is no undo).
export function CancelMeeting({ id, guest, t }: { id: string; guest: string; t: { booking: Catalogue["booking"]; errors: Catalogue["errors"] } }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><CalendarOff />{t.booking.cancel}</button>;
  return (
    <form className="stack" onSubmit={e => {
      e.preventDefault();
      start(async () => {
        const r = await cancelBooking(id, reason);
        if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
        // The guest is told at once (an email, or their page): never an Undo.
        toast({ id: `cancel-${id}`, text: format(r.value.delivery === "email" ? t.booking.cancelledToast : t.booking.cancelledToastPage, { name: guest }), sent: true });
        router.refresh();
      });
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
