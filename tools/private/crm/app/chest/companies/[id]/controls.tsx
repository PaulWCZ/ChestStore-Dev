"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Dots, Merge, Pencil, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
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
export function CompanyControls({ company, ownerName, canEdit, canDelete, fields, team, me, canAssign, locale, t }: { company: CompanyValues & { id: string }; ownerName: string; canEdit: boolean; canDelete: boolean; fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; locale: Locale; t: Catalogue }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const close = (e: { currentTarget: HTMLElement }) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; };
  return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canDelete && (
        <details className="menu">
          <summary className="icon-button" title={t.common.more}><Dots /><span className="visually-hidden">{t.common.more}</span></summary>
          <div className="menu-pop right">
            <button type="button" onClick={e => { close(e); setMerging(true); }}><Merge />{t.common.merge.action}</button>
            <button type="button" className="danger" onClick={e => { close(e); setDeleting(true); }}><Trash />{t.company.deleteCompany}</button>
          </div>
        </details>
      )}
      {editing && <CompanyDialog open onClose={() => setEditing(false)} initial={company} fields={fields} team={team} me={me} canAssign={canAssign} locale={locale} t={t} />}
      {merging && <MergeDialog table="companies" id={company.id} name={company.name} onClose={() => setMerging(false)} t={t} />}
      {deleting && (
        <Dialog open title={t.company.deleteTitle} closeLabel={t.common.close} onClose={() => setDeleting(false)}>
          <p>{t.company.deleteBody}</p>
          <div className="form-actions">
            <button type="button" className="button danger" disabled={pending} onClick={() => start(async () => {
              const r = await deleteCompany(company.id);
              if (!r.ok) return toast(format(t.errors[r.error], r.values));
              toast(t.company.deleted);
              router.push("/chest/companies");
            })}><Trash />{t.company.deleteCompany}</button>
            <button type="button" className="button quiet" onClick={() => setDeleting(false)}>{t.common.cancel}</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
