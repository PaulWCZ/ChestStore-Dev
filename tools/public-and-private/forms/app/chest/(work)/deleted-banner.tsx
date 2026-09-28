"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restoreForm } from "../actions.ts";

// After a form was deleted: say so, and offer to bring it back.
export function DeletedBanner({ formId, text, undo }: { formId: string; text: string; undo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="banner" role="status">
      <span>{text}</span>
      <button type="button" className="button link" disabled={pending} onClick={() => start(async () => { await restoreForm(formId); router.replace(`/chest/forms/${formId}`); })}>{undo}</button>
    </div>
  );
}
