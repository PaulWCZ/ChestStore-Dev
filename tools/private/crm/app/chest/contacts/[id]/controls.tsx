"use client";

import { Confirm, Menu, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Merge, Pencil, Shield, Trash } from "../../../../components/icons.tsx";
import type { FieldDef } from "../../../../lib/custom.ts";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { deleteContact } from "../../actions.ts";
import { ContactDialog } from "../../ui/contact-form.tsx";
import type { ContactValues } from "../../ui/values.ts";
import { MergeDialog } from "../../ui/merge-dialog.tsx";
import type { Teammate } from "../../ui/shared.ts";

// A person's owner and edit; merging a duplicate in the "…" menu.
export function ContactControls({ contact, ownerName, canEdit, canMerge, fields, team, me, canAssign, today, t }: { contact: ContactValues & { id: string }; ownerName: string; canEdit: boolean; canMerge: boolean; fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; today: string; t: Catalogue }) {
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canMerge && <Menu label={t.common.more} items={[{ label: t.common.merge.action, icon: <Merge />, onSelect: () => setMerging(true) }]} />}
      {editing && <ContactDialog open onClose={() => setEditing(false)} initial={contact} fields={fields} team={team} me={me} canAssign={canAssign} canCreate={canEdit} today={today} t={t} />}
      {merging && <MergeDialog table="contacts" id={contact.id} name={contact.name} onClose={() => setMerging(false)} t={t} />}
    </div>
  );
}

// Personal data: the person's right of access (export everything) and to
// be forgotten (erase for good). The one place that asks first (the kit's
// Confirm): nothing can bring it back, and that is the point.
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
      <Confirm open={deleting} title={format(t.contact.deleteTitle, { name })} body={t.contact.deleteBody} confirmLabel={t.contact.deleteConfirm} cancelLabel={t.common.cancel} busy={pending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => start(async () => {
          const r = await deleteContact(id);
          if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
          setDeleting(false);
          toast(t.contact.deleted);
          router.push("/chest/contacts");
        })} />
    </section>
  );
}
