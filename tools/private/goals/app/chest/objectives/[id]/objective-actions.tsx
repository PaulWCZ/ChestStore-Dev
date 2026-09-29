"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { Alert, Carry, Pencil, Trash } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { archiveObjective, carryOver, restoreObjective } from "../../actions.ts";

// What the owner (or an admin) does to an objective: change it, remove it
// (Undo from the toast: it goes to the archive first), carry it over to the next cycle once this one ends.
export function ObjectiveActions({ objectiveId, canEdit, carry, t }: { objectiveId: string; canEdit: boolean; carry: { id: string; label: string } | null; t: { objective: Catalogue["objective"]; errors: Catalogue["errors"] } }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const words = (code: keyof typeof t.errors, values: Record<string, string | number> = {}) => format(t.errors[code], values);

  function remove() {
    start(async () => {
      const r = await archiveObjective(objectiveId);
      if (!r.ok) return setError(words(r.error, r.values));
      toast({
        id: `objective-${objectiveId}`,
        text: t.objective.removed,
        undo: async () => {
          const b = await restoreObjective(objectiveId);
          if (!b.ok) return words(b.error, b.values);
          router.push(`/chest/objectives/${objectiveId}`);
          return true;
        },
      });
      router.push("/chest/company");
    });
  }

  function carryIt(cycleId: string) {
    start(async () => {
      const r = await carryOver(objectiveId, cycleId);
      if (!r.ok) return setError(words(r.error, r.values));
      toast({ id: `carry-${objectiveId}`, text: t.objective.carried, action: { label: t.objective.openCarried, run: () => router.push(`/chest/objectives/${r.value.id}`) } });
      router.refresh();
    });
  }

  return (
    <div className="card facts">
      {canEdit && <Link className="button quiet wide" href={`/chest/objectives/${objectiveId}/edit`}><Pencil />{t.objective.edit}</Link>}
      {carry && <button type="button" className="button quiet wide" disabled={pending} onClick={() => carryIt(carry.id)}><Carry />{carry.label}</button>}
      {canEdit && <button type="button" className="button danger wide" disabled={pending} onClick={remove}><Trash />{t.objective.remove}</button>}
      {error && <p className="error" role="alert"><Alert />{error}</p>}
    </div>
  );
}
