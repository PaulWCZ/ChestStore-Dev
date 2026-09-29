"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Restore, Trash } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { purgePage, restorePage } from "../actions.ts";

// One deleted page: "Restore" first; "Delete for good" cannot be undone,
// so it asks once more in the kit's Confirm (it opens on Cancel).
export function TrashRow({ id, title, detail, t }: { id: string; title: string; detail: string; t: { trash: Catalogue["trash"]; common: Catalogue["common"]; errors: Catalogue["errors"] } }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const run = (step: () => Promise<{ ok: boolean; error?: keyof Catalogue["errors"] }>, done: string, go?: string) => start(async () => {
    const result = await step();
    setAsking(false);
    if (!result.ok) return void toast({ text: format(t.errors[result.error ?? "unknown"], {}), tone: "error" });
    toast({ id: `trash-${id}`, text: done });
    if (go) router.push(go);
    else router.refresh();
  });
  return (
    <li className="trash-row">
      <div>
        <p className="trash-title">{title}</p>
        <p className="muted small">{detail}</p>
      </div>
      <div className="row-actions">
        <button type="button" className="button quiet" disabled={pending} onClick={() => run(() => restorePage(id), t.trash.restored, `/chest/pages/${id}`)}><Restore />{t.trash.restore}</button>
        <button type="button" className="button quiet danger" disabled={pending} onClick={() => setAsking(true)}><Trash />{t.trash.purge}</button>
      </div>
      <Confirm
        open={asking}
        title={format(t.trash.confirmTitle, { title })}
        body={t.trash.confirm}
        confirmLabel={t.trash.purge}
        cancelLabel={t.common.cancel}
        busy={pending}
        onConfirm={() => run(() => purgePage(id), t.trash.purged)}
        onCancel={() => setAsking(false)}
      />
    </li>
  );
}
