import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Check } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../shared/format.ts";

// Closing a cycle: done at once, undone from the toast.
export function CloseCycle({ cycleId, name, t }: { cycleId: string; name: string; t: { cycles: Catalogue["cycles"] } }) {
  const [pending, setPending] = useState(false);
  async function close() {
    if (pending) return;
    setPending(true);
    const r = await call("closeCycle", { id: cycleId });
    setPending(false);
    if (!r.ok) return;
    toast({
      id: `close-${cycleId}`,
      text: format(t.cycles.closedToast, { name }),
      undo: async () => {
        const back = await call("reopenCycle", { id: cycleId }, { quiet: true });
        return back.ok ? true : back.message;
      },
    });
  }
  return <button type="button" className="button" disabled={pending} aria-busy={pending} title={t.cycles.closeHint} onClick={() => void close()}><Check />{t.cycles.close}</button>;
}
