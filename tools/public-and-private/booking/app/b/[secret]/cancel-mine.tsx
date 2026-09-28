"use client";

import { useActionState, useEffect, useState } from "react";
import { cancelMine, type GuestState } from "../../public-actions.ts";
import { Alert, CalendarOff } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";

// Cancelling one's booking: a first click asks for an optional word, the
// second cancels (the page then says it is cancelled).
export function CancelMine({ secret, hostName, t }: { secret: string; hostName: string; t: { public: Catalogue["public"]; errors: Catalogue["errors"] } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<GuestState, FormData>(cancelMine.bind(null, secret), { error: null, done: false });
  useEffect(() => {
    if (state.done) window.location.replace(window.location.pathname);
  }, [state.done]);
  if (!open) return <div><button type="button" className="link-button danger" onClick={() => setOpen(true)}><CalendarOff />{t.public.cancel}</button></div>;
  return (
    <form action={action} className="stack">
      <div>
        <label className="label" htmlFor="reason">{format(t.public.cancelReason, { name: hostName })}</label>
        <textarea id="reason" name="reason" className="field" rows={2} maxLength={500} autoFocus />
      </div>
      {state.error && <p className="error" role="alert"><Alert />{format(t.errors[state.error], { max: 500 })}</p>}
      <div className="row">
        <button type="submit" className="button danger" disabled={pending}>{t.public.cancelConfirm}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.public.keep}</button>
      </div>
    </form>
  );
}
