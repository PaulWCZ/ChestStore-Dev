"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { approveProposal, declineProposal, restoreProposal } from "../actions.ts";

// A publisher's two answers to a proposal: Publish (it goes on the front
// page, signed by its author; the toast opens it), or Decline with a
// reason if they like — Undo puts it back in the list. The author is told
// either way (lib/tell.ts).
export function Decide({ id, author, t, errors }: { id: string; author: string; t: Catalogue["approve"]; errors: Catalogue["errors"] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const failed = (code: keyof Catalogue["errors"], values: Record<string, string | number> = {}) => toast({ text: format(errors[code], values), tone: "error" });
  if (declining) {
    return (
      <form className="decline" onSubmit={e => { e.preventDefault(); start(async () => {
        const r = await declineProposal(id, reason.trim() || null);
        if (!r.ok) return void failed(r.error, r.values ?? {});
        router.refresh();
        toast({
          id: `proposal-${id}`,
          text: t.declinedToast,
          undo: async () => {
            const back = await restoreProposal(id);
            if (!back.ok) return format(errors[back.error], back.values ?? {});
            router.refresh();
            return true;
          },
        });
      }); }}>
        <label htmlFor={`reason-${id}`}>{format(t.reason, { name: author })}</label>
        <textarea id={`reason-${id}`} className="field" rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
        <div className="row">
          <button type="submit" className="button danger small" disabled={busy}>{t.decline}</button>
          <button type="button" className="button quiet small" onClick={() => { setDeclining(false); setReason(""); }}>{t.cancel}</button>
        </div>
      </form>
    );
  }
  return (
    <div className="row decide">
      <button type="button" className="button small" disabled={busy} onClick={() => start(async () => {
        const r = await approveProposal(id);
        if (!r.ok) return void failed(r.error, r.values ?? {});
        router.refresh();
        toast({ id: `proposal-${id}`, text: t.published });
      })}><Check />{t.publish}</button>
      <button type="button" className="button quiet small" disabled={busy} onClick={() => setDeclining(true)}>{t.decline}</button>
    </div>
  );
}
