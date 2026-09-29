"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ErrorCode } from "../../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format } from "../../../../../lib/i18n/format.ts";
import { closeForm, reopenForm } from "../../../actions.ts";

// The form's name in its header: it follows the title as the builder types
// it (the builder tells it, "forms:title").
export function FormTitle({ initial, untitled }: { initial: string; untitled: string }) {
  const [title, setTitle] = useState(initial);
  useEffect(() => setTitle(initial), [initial]);
  useEffect(() => {
    const follow = (e: Event) => setTitle(String((e as CustomEvent<string>).detail ?? ""));
    window.addEventListener("forms:title", follow);
    return () => window.removeEventListener("forms:title", follow);
  }, []);
  return <h1>{title.trim() || untitled}</h1>;
}

// Stop taking answers, or take them again: next to the form's state, where
// people look for it. Either way, Undo in the toast does the other.
export function StatusControl({ formId, open, canReopen, t }: { formId: string; open: boolean; canReopen: boolean; t: { close: string; reopen: string; closed: string; reopened: string; errors: Catalogue["errors"] } }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const say = (error: ErrorCode, values?: Record<string, string | number>) => format(t.errors[error] ?? t.errors.unknown, values ?? {});
  const act = () => start(async () => {
    const r = await (open ? closeForm(formId) : reopenForm(formId));
    if (r.ok) {
      toast({
        id: `state-${formId}`,
        text: open ? t.closed : t.reopened,
        undo: async () => {
          const back = await (open ? reopenForm(formId) : closeForm(formId));
          router.refresh();
          return back.ok || say(back.error as ErrorCode, back.values);
        },
      });
      router.refresh();
    } else toast({ id: `state-${formId}`, text: say(r.error as ErrorCode, r.values), tone: "error" });
  });
  if (!open && !canReopen) return null;
  return <button type="button" className="button quiet small status-action" disabled={pending} onClick={act}>{open ? t.close : t.reopen}</button>;
}
