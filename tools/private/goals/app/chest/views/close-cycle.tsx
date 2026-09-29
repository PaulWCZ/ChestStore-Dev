"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@argentic/chest-ui/components";
import { Check } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { closeCycle, reopenCycle } from "../actions.ts";

// Closing a cycle: done at once, undone from the toast.
export function CloseCycle({ cycleId, name, t }: { cycleId: string; name: string; t: { cycles: Catalogue["cycles"]; errors: Catalogue["errors"] } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button type="button" className="button" disabled={pending} title={t.cycles.closeHint} onClick={() => start(async () => {
      const r = await closeCycle(cycleId);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
      toast({
        id: `close-${cycleId}`,
        text: format(t.cycles.closedToast, { name }),
        undo: async () => {
          const back = await reopenCycle(cycleId);
          if (!back.ok) return format(t.errors[back.error], back.values ?? {});
          router.refresh();
          return true;
        },
      });
      router.refresh();
    })}><Check />{t.cycles.close}</button>
  );
}
