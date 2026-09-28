"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash } from "../../../../../../../components/icons.tsx";
import { useToast } from "../../../../../../../components/toast.tsx";
import type { Catalogue } from "../../../../../../../lib/i18n/index.ts";
import { deleteAnswer, restoreAnswer } from "../../../../../actions.ts";

// Delete an answer, with Undo (kept aside a week, then gone for good).
export function AnswerActions({ formId, answerId, deleted, t }: { formId: string; answerId: string; deleted: boolean; t: { a: Catalogue["answers"]; errors: Catalogue["errors"] } }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const restore = () => start(async () => {
    const r = await restoreAnswer(formId, answerId);
    if (!r.ok) toast(t.errors[r.error] ?? t.errors.unknown);
    router.refresh();
  });
  if (deleted) return <div className="row-actions"><button type="button" className="button quiet" disabled={pending} onClick={restore}>{t.a.restore}</button></div>;
  return (
    <div className="row-actions">
      <button type="button" className="button quiet danger" disabled={pending} onClick={() => start(async () => {
        const r = await deleteAnswer(formId, answerId);
        if (!r.ok) return void toast(t.errors[r.error] ?? t.errors.unknown);
        toast(t.a.deleted, { label: t.a.undo, run: restore });
        router.refresh();
      })}><Trash />{t.a.delete}</button>
    </div>
  );
}
