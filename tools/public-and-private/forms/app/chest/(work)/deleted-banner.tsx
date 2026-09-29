"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { restoreForm } from "../actions.ts";

// After a form was deleted (Settings → Delete this form): say so, with
// Undo — it waits 30 days in Deleted forms, with its answers and files, so
// deleting never asks first. Undo brings it back and opens it.
export function DeletedToast({ formId, text, errors }: { formId: string; text: string; errors: Catalogue["errors"] }) {
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    toast({
      id: `deleted-${formId}`,
      text,
      undo: async () => {
        const r = await restoreForm(formId);
        if (!r.ok) return format(errors[r.error] ?? errors.unknown, r.values ?? {});
        router.push(`/chest/forms/${formId}`);
        return true;
      },
    });
    // The address no longer says it: a reload shows no second toast.
    router.replace("/chest", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);
  return null;
}
