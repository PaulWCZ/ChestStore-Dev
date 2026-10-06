import { useState, useTransition } from "react";
import { Check } from "../components/icons.tsx";
import { call, toast } from "@argentic/chest-app/client";
import type { Catalogue } from "../i18n/index.ts";
import { fill } from "@argentic/chest-app/client";

// A publisher's two answers to a proposal: Publish (it goes on the front
// page, signed by its author; the toast opens it), or Decline with a
// reason if they like — Undo puts it back in the list. The author is told
// either way (src/lib/tell.ts).
export function Decide({ id, author, t }: { id: string; author: string; t: Catalogue["approve"] }) {
  const [busy, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  if (declining) {
    return (
      <form className="decline" onSubmit={e => { e.preventDefault(); start(async () => {
        const r = await call("declineProposal", { proposalId: id, reason: reason.trim() || null });
        if (!r.ok) return;
        toast({
          id: `proposal-${id}`,
          text: t.declinedToast,
          undo: async () => {
            const back = await call("restoreProposal", { proposalId: id }, { quiet: true });
            return back.ok ? true : back.message;
          },
        });
      }); }}>
        <label htmlFor={`reason-${id}`}>{fill(t.reason, { name: author })}</label>
        <textarea id={`reason-${id}`} className="field" rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
        <div className="row">
          <button type="submit" className="button danger small" disabled={busy}>{t.decline}</button>
          <button type="button" className="button quiet small" onClick={() => { setDeclining(false); setReason(""); }}>{t.cancel}</button>
        </div>
      </form>
    );
  }
  return (
    <div className="row">
      <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
        const r = await call("approveProposal", { proposalId: id });
        if (!r.ok) return;
        toast({ id: `proposal-${id}`, text: t.published });
      })}><Check />{t.publish}</button>
      <button type="button" className="button quiet small" disabled={busy} onClick={() => setDeclining(true)}>{t.decline}</button>
    </div>
  );
}
