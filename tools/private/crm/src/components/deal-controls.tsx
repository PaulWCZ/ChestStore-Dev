import { call, navigate, toast } from "@argentic/chest-app/client";
import { Confirm, Menu } from "@argentic/chest-ui/components";
import { useRef, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { DealDialog, type DealFormProps, type DealWords } from "./deal-form.tsx";
import { Check, Flag, Lost, Pencil, Trash, Trophy } from "./icons.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import { ReasonDialog } from "./reason-dialog.tsx";
import type { Teammate, Words } from "./shared.ts";
import type { DealValues } from "./values.ts";

export type DealControlWords = DealWords & Words<"deals">;

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
  t: DealControlWords;
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
    const current = stages.find(s => s.id === deal.stageId)!;
  const open = stages.filter(s => s.kind === "open");
  const won = stages.find(s => s.kind === "won")!;
  const lost = stages.find(s => s.kind === "lost")!;
  const at = open.findIndex(s => s.id === deal.stageId);
  const ripe = at === open.length - 1;
  const move = (stage: Stage, reason?: string) => start(async () => {
    const r = await call("moveDeal", { id: deal.id, stage: stage.id, ...(reason !== undefined ? { reason } : {}) });
    if (!r.ok) return;
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
          <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => { const r = await call("setDealOwner", { id: deal.id, owner: me }); if (r.ok) toast(t.common.taken); })}><Check />{t.common.take}</button>
        )}
        <span className="spacer" />
        {editable && canAssign && <OwnerInline owner={deal.owner} team={team} me={me} canAssign={canAssign} give={owner => start(async () => { const r = await call("setDealOwner", { id: deal.id, owner }); if (r.ok) toast(t.common.saved); })} t={t} />}
        {editable && (
          <Menu label={t.common.more} items={[
            { label: t.deal.edit, icon: <Pencil />, onSelect: () => setEditing(true) },
            { label: t.deal.deleteDeal, icon: <Trash />, tone: "danger", onSelect: () => setDeleting(true) },
          ]} />
        )}
      </div>
      {closing && <ReasonDialog stage={closing} title={deal.title} onCancel={() => setClosing(null)} onConfirm={reason => { const s = closing; setClosing(null); move(s, reason); }} t={t} />}
      {editing && (
        <DealDialog open onClose={() => setEditing(false)} initial={deal} {...form} />
      )}
      {/* Deleting a deal cannot be undone: the kit's Confirm asks once, and
          offers what is usually meant instead (Lost, with a reason). */}
      <Confirm open={deleting} title={t.deal.deleteTitle} body={t.deal.deleteBody} confirmLabel={t.deal.deleteDeal} cancelLabel={t.common.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => start(async () => {
          const r = await call("deleteDeal", { id: deal.id }, { refresh: false });
          if (!r.ok) return;
          setDeleting(false);
          toast(t.deal.deleted);
          await navigate("/chest/deals");
        })}>
        {current.kind === "open" && <button type="button" className="button quiet lost-outline" onClick={() => { setDeleting(false); setClosing(lost); }}><Lost />{t.deal.markLost}</button>}
      </Confirm>
    </div>
  );
}

// The deal's owner, changed where it is shown: a person chosen is saved at
// once; the field emptied gives it to nobody once the field is left (not
// while one erases a name to type another).
function OwnerInline({ owner, team, me, canAssign, give, t }: { owner: string | null; team: Teammate[]; me: string; canAssign: boolean; give: (owner: string | null) => void; t: OwnerWords & Words<"deal"> }) {
  const emptied = useRef(false);
  return (
    <span className="owner-inline" onBlur={e => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null) || !emptied.current) return;
      emptied.current = false;
      if (owner !== null) give(null);
    }}>
      <OwnerPicker id="deal-owner" label={t.deal.owner} hint={false} value={owner} team={team} me={me} canAssign={canAssign}
        onChange={next => { emptied.current = next === null; if (next !== null && next !== owner) give(next); }} t={t} />
    </span>
  );
}
