"use client";

import { Confirm, Menu, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Merge, Pencil, Trash } from "../../../../components/icons.tsx";
import type { FieldDef } from "../../../../lib/custom.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { deleteCompany } from "../../actions.ts";
import { CompanyDialog } from "../../ui/company-form.tsx";
import { MergeDialog } from "../../ui/merge-dialog.tsx";
import type { Teammate } from "../../ui/shared.ts";
import type { CompanyValues } from "../../ui/values.ts";

// A company's owner and edit; the rare actions — merge a duplicate, delete
// (it asks once: it cannot be undone) — in the "…" menu, never a big red
// button under the name.
export function CompanyControls({ company, ownerName, canEdit, canDelete, fields, team, me, canAssign, today, locale, t }: { company: CompanyValues & { id: string }; ownerName: string; canEdit: boolean; canDelete: boolean; fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; today: string; locale: Locale; t: Catalogue }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
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
      {editing && <CompanyDialog open onClose={() => setEditing(false)} initial={company} fields={fields} team={team} me={me} canAssign={canAssign} today={today} locale={locale} t={t} />}
      {merging && <MergeDialog table="companies" id={company.id} name={company.name} onClose={() => setMerging(false)} t={t} />}
      <Confirm open={deleting} title={t.company.deleteTitle} body={t.company.deleteBody} confirmLabel={t.company.deleteCompany} cancelLabel={t.common.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => start(async () => {
          const r = await deleteCompany(company.id);
          if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
          setDeleting(false);
          toast(t.company.deleted);
          router.push("/chest/companies");
        })} />
    </div>
  );
}
