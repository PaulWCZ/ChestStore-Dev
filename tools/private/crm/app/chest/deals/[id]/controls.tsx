"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Check, Dots, Flag, Lost, Pencil, Trash, Trophy } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { deleteDeal, moveDeal, setDealOwner } from "../../actions.ts";
import { DealDialog } from "../../ui/deal-form.tsx";
import { OwnerSelect } from "../../ui/owner-select.tsx";
import type { DealFormProps } from "../../ui/deal-form.tsx";
import type { Teammate } from "../../ui/shared.ts";
import { ReasonDialog } from "../../ui/reason-dialog.tsx";
import type { DealValues } from "../../ui/values.ts";

type Stage = { id: string; name: string; kind: "open" | "won" | "lost"; probability: number };
type Props = {
  deal: DealValues & { id: string; stageId: string };
  stages: Stage[];
  editable: boolean;
  canCreate: boolean;
  form: DealFormProps;
  team: Teammate[];
  me: string;
  canAssign: boolean;
  t: Catalogue;
};

// A deal's controls: its stages as a path (one click moves it; on a phone,
// a list to choose from), Won and Lost (with a reason), its owner, edit and
// delete. Won is the loud button only once the deal reached its last open
// stage: before that, planning the next step matters more.
export function DealControls({ deal, stages, editable, canCreate, form, team, me, canAssign, t }: Props) {
  const [pending, start] = useTransition();
  const [closing, setClosing] = useState<Stage | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const current = stages.find(s => s.id === deal.stageId)!;
  const open = stages.filter(s => s.kind === "open");
  const won = stages.find(s => s.kind === "won")!;
  const lost = stages.find(s => s.kind === "lost")!;
  const at = open.findIndex(s => s.id === deal.stageId);
  const ripe = at === open.length - 1;
  const move = (stage: Stage, reason?: string) => start(async () => {
    const r = await moveDeal(deal.id, stage.id, null, null, reason);
    if (!r.ok) return toast(format(t.errors[r.error], r.values));
    toast(stage.kind === "won" ? t.deal.wonToast : stage.kind === "lost" ? t.deal.lostToast : format(t.deals.moved, { stage: stage.name }));
  });
  // Someone of sales may take a deal nobody owns.
  const canTake = !editable ? false : deal.owner === null && canCreate;
  return (
    <div className="deal-controls">
      <ol className={`stage-path${current.kind !== "open" ? " closed" : ""}`} aria-label={t.deal.stagePath}>
        {open.map((s, i) => (
          <li key={s.id} className={i < at || current.kind === "won" ? "past" : i === at ? "current" : ""}>
            {editable && s.id !== deal.stageId ? (
              <button type="button" disabled={pending} onClick={() => move(s)} title={format(t.deal.setStage, { stage: s.name })}>{s.name}</button>
            ) : <span aria-current={s.id === deal.stageId ? "step" : undefined}>{s.name}</span>}
          </li>
        ))}
      </ol>
      {editable && current.kind === "open" && (
        <p className="stage-select">
          <label className="label-mono" htmlFor="deal-stage">{t.deal.stageSelect}</label>
          <select id="deal-stage" className="field" value={deal.stageId} disabled={pending} onChange={e => { const s = open.find(x => x.id === e.target.value); if (s) move(s); }}>
            {open.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </p>
      )}
      <div className="deal-actions">
        {editable && current.kind === "open" && (
          <>
            <button type="button" className={ripe ? "button won" : "button quiet won-outline"} disabled={pending} onClick={() => setClosing(won)}><Trophy />{t.deal.markWon}</button>
            <button type="button" className="button quiet lost-outline" disabled={pending} onClick={() => setClosing(lost)}><Lost />{t.deal.markLost}</button>
          </>
        )}
        {editable && current.kind !== "open" && open[0] && (
          <button type="button" className="button quiet" disabled={pending} onClick={() => move(open[open.length - 1]!)}><Flag />{t.deal.reopen}</button>
        )}
        {canTake && (
          <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => { const r = await setDealOwner(deal.id, me); toast(r.ok ? t.common.taken : format(t.errors[r.error], r.values)); })}><Check />{t.common.take}</button>
        )}
        <span className="spacer" />
        {editable && canAssign && (
          <span className="owner-inline">
            <label className="label-mono" htmlFor="deal-owner">{t.deal.owner}</label>
            <OwnerSelect id="deal-owner" value={deal.owner} team={team} me={me} canAssign={canAssign} onChange={owner => start(async () => { const r = await setDealOwner(deal.id, owner); toast(r.ok ? t.common.saved : format(t.errors[r.error], r.values)); })} t={t} />
          </span>
        )}
        {editable && (
          <details className="menu">
            <summary className="icon-button" title={t.common.edit}><Dots /><span className="visually-hidden">{t.common.edit}</span></summary>
            <div className="menu-pop right">
              <button type="button" onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setEditing(true); }}><Pencil />{t.deal.edit}</button>
              <button type="button" className="danger" onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setDeleting(true); }}><Trash />{t.deal.deleteDeal}</button>
            </div>
          </details>
        )}
      </div>
      {closing && <ReasonDialog stage={closing} title={deal.title} onCancel={() => setClosing(null)} onConfirm={reason => { const s = closing; setClosing(null); move(s, reason); }} t={t} />}
      {editing && (
        <DealDialog open onClose={() => setEditing(false)} initial={deal} {...form} />
      )}
      {deleting && (
        <Dialog open title={t.deal.deleteTitle} closeLabel={t.common.close} onClose={() => setDeleting(false)}>
          <p>{t.deal.deleteBody}</p>
          <div className="form-actions">
            <button type="button" className="button danger" disabled={pending} onClick={() => start(async () => {
              const r = await deleteDeal(deal.id);
              if (!r.ok) return toast(format(t.errors[r.error], r.values));
              toast(t.deal.deleted);
              router.push("/chest/deals");
            })}><Trash />{t.deal.deleteDeal}</button>
            <button type="button" className="button quiet" onClick={() => setDeleting(false)}>{t.common.cancel}</button>
            {current.kind === "open" && <button type="button" className="button quiet lost-outline" onClick={() => { setDeleting(false); setClosing(lost); }}><Lost />{t.deal.markLost}</button>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
