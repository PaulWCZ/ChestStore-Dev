"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Restore, Trash } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { purgePage, restorePage } from "../actions.ts";

// One deleted page: "Restore" first; "Delete for good" asks once more, in
// place (it cannot be undone).
export function TrashRow({ id, title, detail, t }: { id: string; title: string; detail: string; t: { trash: Catalogue["trash"]; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"] }>, done: string, go?: string) => start(async () => {
    const result = await step();
    if (!result.ok) return toast(format(t.errors[result.error ?? "unknown"], {}));
    toast(done);
    if (go) router.push(go);
    else router.refresh();
  });
  return (
    <li className="trash-row">
      <div>
        <p className="trash-title">{title}</p>
        <p className="muted small">{detail}</p>
        {confirm && <p className="error" role="alert">{t.trash.confirm}</p>}
      </div>
      <div className="row-actions">
        <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => restorePage(id), t.trash.restored, `/chest/pages/${id}`)}><Restore />{t.trash.restore}</button>
        <button type="button" className="button quiet danger" disabled={pending} onClick={() => (confirm ? run(() => purgePage(id), t.trash.purged) : setConfirm(true))}><Trash />{t.trash.purge}</button>
      </div>
    </li>
  );
}
