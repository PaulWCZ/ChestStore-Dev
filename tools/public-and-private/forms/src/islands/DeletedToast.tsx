import { call, toast } from "@argentic/chest-app/client";
import { useEffect } from "react";

// After a form was deleted (Settings → Delete this form): say so, with
// Undo — it waits 30 days in Deleted forms, with its answers and files, so
// deleting never asks first. Undo brings it back and opens it.
export function DeletedToast({ formId, text }: { formId: string; text: string }) {
  useEffect(() => {
    toast({
      id: `deleted-${formId}`,
      text,
      undo: async () => {
        const r = await call("restoreForm", { id: formId, open: true }, { quiet: true });
        return r.ok || r.message;
      },
    });
    // The address no longer says it: a reload shows no second toast.
    history.replaceState(history.state, "", "/chest");
  }, [formId, text]);
  return null;
}
