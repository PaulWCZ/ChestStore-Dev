import { call, navigate, toast } from "@argentic/chest-app/client";
import { Confirm, Menu } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { CompanyDialog, type CompanyFormProps } from "./company-form.tsx";
import { Merge, Pencil, Trash } from "./icons.tsx";
import { MergeDialog } from "./merge-dialog.tsx";
import type { Words } from "./shared.ts";
import type { CompanyValues } from "./values.ts";

// A company's owner and edit; the rare actions — merge a duplicate, delete
// (it asks once: it cannot be undone) — in the "…" menu, never a big red
// button under the name.
export function CompanyControls({ company, ownerName, canEdit, canDelete, form, t }: { company: CompanyValues & { id: string }; ownerName: string; canEdit: boolean; canDelete: boolean; form: CompanyFormProps; t: CompanyFormProps["t"] & Words<"deal"> }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pending, start] = useTransition();
    return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canDelete && (
        <Menu label={t.common.more} items={[
          { label: t.common.merge.action, icon: <Merge />, onSelect: () => setMerging(true) },
          { label: t.company.deleteCompany, icon: <Trash />, tone: "danger", onSelect: () => setDeleting(true) },
        ]} />
      )}
      {editing && <CompanyDialog open onClose={() => setEditing(false)} initial={company} {...form} />}
      {merging && <MergeDialog table="companies" id={company.id} name={company.name} onClose={() => setMerging(false)} t={t} />}
      <Confirm open={deleting} title={t.company.deleteTitle} body={t.company.deleteBody} confirmLabel={t.company.deleteCompany} cancelLabel={t.common.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => start(async () => {
          const r = await call("deleteCompany", { id: company.id }, { refresh: false });
          if (!r.ok) return;
          setDeleting(false);
          toast(t.company.deleted);
          await navigate("/chest/companies");
        })} />
    </div>
  );
}
