"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { closeCycle, reopenCycle } from "../actions.ts";

// Closing a cycle: done at once, undone from the toast.
export function CloseCycle({ cycleId, name, t }: { cycleId: string; name: string; t: { cycles: Catalogue["cycles"]; errors: Catalogue["errors"]; checkIn: Catalogue["checkIn"] } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button type="button" className="button" disabled={pending} title={t.cycles.closeHint} onClick={() => start(async () => {
      const r = await closeCycle(cycleId);
      if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
      toast(format(t.cycles.closedToast, { name }), { label: t.checkIn.undo, run: () => start(async () => { await reopenCycle(cycleId); router.refresh(); }) });
      router.refresh();
    })}><Check />{t.cycles.close}</button>
  );
}
