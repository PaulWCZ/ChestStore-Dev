"use client";

import { Dialog } from "@argentic/chest-ui/components";
import { useId, useState } from "react";
import { Lost, Trophy } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost" };

// Won or lost: why, in a few words (one tap on a usual reason), or none.
// The kit's Dialog: a reason typed is not lost to a stray click outside.
export function ReasonDialog({ stage, title, onCancel, onConfirm, t }: { stage: Stage; title: string; onCancel: () => void; onConfirm: (reason: string) => void; t: Catalogue }) {
  const [reason, setReason] = useState("");
  const formId = useId();
  const won = stage.kind === "won";
  const usual = won ? [] : [t.deal.reasons.price, t.deal.reasons.competitor, t.deal.reasons.timing, t.deal.reasons.noAnswer, t.deal.reasons.noNeed, t.deal.reasons.budget];
  return (
    <Dialog open title={won ? t.deal.reasonWon : t.deal.reasonLost} onClose={onCancel} dirty={reason.trim() !== ""} labels={t.dialog} size="s"
      footer={<>
        <button type="button" className="button quiet" onClick={onCancel}>{t.common.cancel}</button>
        <button type="submit" form={formId} className={`button ${won ? "won" : "lost"}`}>{won ? <Trophy /> : <Lost />}{won ? t.deal.markWon : t.deal.markLost}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => { e.preventDefault(); onConfirm(reason); }}>
        <p className="strong">{title}</p>
        {usual.length > 0 && (
          <div className="quick-days" role="group" aria-label={t.deal.reasonLost}>
            {usual.map(u => <button key={u} type="button" className={`chip-button${reason === u ? " on" : ""}`} aria-pressed={reason === u} onClick={() => setReason(u)}>{u}</button>)}
          </div>
        )}
        <div className="field-block">
          <label className="label" htmlFor="reason">{t.deal.reasonHint}</label>
          <input id="reason" className="field" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} />
        </div>
      </form>
    </Dialog>
  );
}
