import { useState } from "react";
import { Alert, CalendarOff } from "../components/icons.tsx";
import { call, FormToken } from "@argentic/chest-app/client";
import { format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";

// Cancelling one's booking: a first click asks for an optional word, the
// second cancels (the page, read again, then says it is cancelled).
export function CancelMine({ secret, hostName, t }: { secret: string; hostName: string; t: { public: Catalogue["public"] } }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The token for cancelMine, on the page from the start (the form opens later).
  if (!open) return <div><FormToken action="cancelMine" /><button type="button" className="link-button danger" onClick={() => setOpen(true)}><CalendarOff />{t.public.cancel}</button></div>;
  return (
    <form className="stack" onSubmit={async e => {
      e.preventDefault();
      const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
      setPending(true);
      const r = await call("cancelMine", { secret, reason }, { quiet: true });
      setPending(false);
      if (!r.ok) setError(r.message);
    }}>
      <FormToken action="cancelMine" />
      <div>
        <label className="label" htmlFor="reason">{format(t.public.cancelReason, { name: hostName })}</label>
        <textarea id="reason" name="reason" className="field" rows={2} maxLength={500} autoFocus />
      </div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="row">
        <button type="submit" className="button danger" disabled={pending}>{t.public.cancelConfirm}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.public.keep}</button>
      </div>
    </form>
  );
}
