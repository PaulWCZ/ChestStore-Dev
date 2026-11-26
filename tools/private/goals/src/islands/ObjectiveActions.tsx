import { call, navigate, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Alert, Carry, Pencil, Trash } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// What the owner (or an admin) does to an objective: change it, remove it
// (Undo from the toast: it goes to the archive first), carry it over to
// the next cycle once this one ends.
export function ObjectiveActions({ objectiveId, canEdit, carry, t }: { objectiveId: string; canEdit: boolean; carry: { id: string; label: string } | null; t: { objective: Catalogue["objective"] } }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(step: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    try { await step(); } finally { setPending(false); }
  }

  const remove = () => act(async () => {
    const r = await call("archiveObjective", { id: objectiveId }, { quiet: true, refresh: false });
    if (!r.ok) return setError(r.message);
    toast({
      id: `objective-${objectiveId}`,
      text: t.objective.removed,
      undo: async () => {
        const b = await call("restoreObjective", { id: objectiveId }, { quiet: true, refresh: false });
        if (!b.ok) return b.message;
        await navigate(`/chest/objectives/${objectiveId}`);
        return true;
      },
    });
    await navigate("/chest/company");
  });

  const carryIt = (cycleId: string) => act(async () => {
    const r = await call("carryOver", { id: objectiveId, cycleId }, { quiet: true });
    if (!r.ok) return setError(r.message);
    toast({ id: `carry-${objectiveId}`, text: t.objective.carried, action: { label: t.objective.openCarried, run: () => void navigate(`/chest/objectives/${r.value.id}`) } });
  });

  return (
    <div className="card facts">
      {canEdit && <a className="button quiet wide" href={`/chest/objectives/${objectiveId}/edit`}><Pencil />{t.objective.edit}</a>}
      {carry && <button type="button" className="button quiet wide" disabled={pending} onClick={() => void carryIt(carry.id)}><Carry />{carry.label}</button>}
      {canEdit && <button type="button" className="button danger wide" disabled={pending} aria-busy={pending} onClick={() => void remove()}><Trash />{t.objective.remove}</button>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </div>
  );
}
