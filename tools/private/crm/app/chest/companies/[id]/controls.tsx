"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Pencil, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { deleteCompany } from "../../actions.ts";
import { CompanyDialog } from "../../ui/company-form.tsx";
import type { CompanyValues } from "../../ui/values.ts";
import type { Teammate } from "../../ui/shared.ts";

// A company's owner, edit and delete (deleting asks once: it cannot be undone).
export function CompanyControls({ company, ownerName, canEdit, canDelete, team, me, canAssign, t }: { company: CompanyValues & { id: string }; ownerName: string; canEdit: boolean; canDelete: boolean; team: Teammate[]; me: string; canAssign: boolean; t: Catalogue }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canDelete && <button type="button" className="button small quiet danger-text" onClick={() => setDeleting(true)}><Trash />{t.common.delete}</button>}
      {editing && <CompanyDialog open onClose={() => setEditing(false)} initial={company} team={team} me={me} canAssign={canAssign} t={t} />}
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
