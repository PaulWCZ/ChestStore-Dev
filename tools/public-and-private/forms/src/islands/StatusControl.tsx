import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";

// Stop taking answers, or take them again: next to the form's state, where
// people look for it. Either way, Undo in the toast does the other.
export function StatusControl({ formId, open, t }: { formId: string; open: boolean; t: { close: string; reopen: string; closed: string; reopened: string } }) {
  const [pending, setPending] = useState(false);
  const act = async () => {
    setPending(true);
    const r = await call(open ? "closeForm" : "reopenForm", { id: formId });
    setPending(false);
    if (!r.ok) return;
    toast({
      id: `state-${formId}`,
      text: open ? t.closed : t.reopened,
      undo: async () => {
        const back = await call(open ? "reopenForm" : "closeForm", { id: formId }, { quiet: true });
        return back.ok || back.message;
      },
    });
  };
  return <button type="button" className="button quiet small status-action" disabled={pending} onClick={() => void act()}>{open ? t.close : t.reopen}</button>;
}
