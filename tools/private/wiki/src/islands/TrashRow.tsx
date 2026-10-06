import { call, fill as format, navigate, toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Restore, Trash } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// One deleted page: "Restore" first; "Delete for good" cannot be undone,
// so it asks once more in the kit's Confirm (it opens on Cancel).
export function TrashRow({ id, title, detail, t }: { id: string; title: string; detail: string; t: { trash: Catalogue["trash"]; common: Catalogue["common"] } }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const run = (name: "restorePage" | "purgePage", done: string, go?: string) => start(async () => {
    const result = await call(name, { pageId: id }, go ? { refresh: false } : {});
    setAsking(false);
    if (!result.ok) return;
    toast({ id: `trash-${id}`, text: done });
    if (go) await navigate(go);
  });
  return (
    <li className="trash-row">
      <div>
        <p className="trash-title">{title}</p>
        <p className="muted small">{detail}</p>
      </div>
      <div className="row-actions">
        <button type="button" className="button quiet" disabled={pending} onClick={() => run("restorePage", t.trash.restored, `/chest/pages/${id}`)}><Restore />{t.trash.restore}</button>
        <button type="button" className="button quiet danger" disabled={pending} onClick={() => setAsking(true)}><Trash />{t.trash.purge}</button>
      </div>
      <Confirm
        open={asking}
        title={format(t.trash.confirmTitle, { title })}
        body={t.trash.confirm}
        confirmLabel={t.trash.purge}
        cancelLabel={t.common.cancel}
        busy={pending}
        onConfirm={() => run("purgePage", t.trash.purged)}
        onCancel={() => setAsking(false)}
      />
    </li>
  );
}
