"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../../components/dialog.tsx";
import { Dots, Download, Merge, Pencil, Shield, Trash } from "../../../../components/icons.tsx";
import type { FieldDef } from "../../../../lib/custom.ts";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { deleteContact } from "../../actions.ts";
import { ContactDialog } from "../../ui/contact-form.tsx";
import type { ContactValues } from "../../ui/values.ts";
import { MergeDialog } from "../../ui/merge-dialog.tsx";
import type { Teammate } from "../../ui/shared.ts";

// A person's owner and edit; merging a duplicate in the "…" menu.
export function ContactControls({ contact, ownerName, canEdit, canMerge, fields, team, me, canAssign, t }: { contact: ContactValues & { id: string }; ownerName: string; canEdit: boolean; canMerge: boolean; fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; t: Catalogue }) {
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canMerge && (
        <details className="menu">
          <summary className="icon-button" title={t.common.more}><Dots /><span className="visually-hidden">{t.common.more}</span></summary>
          <div className="menu-pop right">
            <button type="button" onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setMerging(true); }}><Merge />{t.common.merge.action}</button>
          </div>
        </details>
      )}
      {editing && <ContactDialog open onClose={() => setEditing(false)} initial={contact} fields={fields} team={team} me={me} canAssign={canAssign} canCreate={canEdit} t={t} />}
      {merging && <MergeDialog table="contacts" id={contact.id} name={contact.name} onClose={() => setMerging(false)} t={t} />}
    </div>
  );
}

// Personal data: the person's right of access (export everything) and to
// be forgotten (delete for good). The one place that asks "are you sure":
// nothing can bring it back, and that is the point.
export function PrivacyPanel({ id, name, canDelete, t }: { id: string; name: string; canDelete: boolean; t: Catalogue }) {
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <section className="panel privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="label-mono"><Shield />{t.contact.privacy}</h2>
      <p className="small-text muted">{t.contact.exportHint}</p>
      <a className="button small quiet" href={`/chest/contacts/${id}/data`} download><Download />{t.contact.exportData}</a>
      {canDelete && (
        <>
          <p className="small-text muted">{t.contact.deleteHint}</p>
          <button type="button" className="button small quiet danger-text" onClick={() => setDeleting(true)}><Trash />{t.contact.deleteContact}</button>
        </>
      )}
      {deleting && (
        <Dialog open title={format(t.contact.deleteTitle, { name })} closeLabel={t.common.close} onClose={() => setDeleting(false)}>
          <p>{t.contact.deleteBody}</p>
          <div className="form-actions">
            <button type="button" className="button danger" disabled={pending} onClick={() => start(async () => {
              const r = await deleteContact(id);
              if (!r.ok) return toast(format(t.errors[r.error], r.values));
              toast(t.contact.deleted);
              router.push("/chest/contacts");
            })}><Trash />{t.contact.deleteConfirm}</button>
            <button type="button" className="button quiet" onClick={() => setDeleting(false)}>{t.common.cancel}</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
