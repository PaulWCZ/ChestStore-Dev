import { call, navigate, toast } from "@argentic/chest-app/client";
import { Confirm, Menu } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { ContactDialog, type ContactFormProps } from "./contact-form.tsx";
import { Download, Merge, Pencil, Shield, Trash } from "./icons.tsx";
import { MergeDialog } from "./merge-dialog.tsx";
import type { Words } from "./shared.ts";
import type { ContactValues } from "./values.ts";

// A person's owner and edit; merging a duplicate in the "…" menu.
export function ContactControls({ contact, ownerName, canEdit, canMerge, form, t }: { contact: ContactValues & { id: string }; ownerName: string; canEdit: boolean; canMerge: boolean; form: ContactFormProps; t: ContactFormProps["t"] }) {
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  return (
    <div className="record-bar">
      <span className="owner-line"><span className="label-mono">{t.common.owner}</span> {ownerName}</span>
      <span className="spacer" />
      {canEdit && <button type="button" className="button small quiet" onClick={() => setEditing(true)}><Pencil />{t.common.edit}</button>}
      {canMerge && <Menu label={t.common.more} items={[{ label: t.common.merge.action, icon: <Merge />, onSelect: () => setMerging(true) }]} />}
      {editing && <ContactDialog open onClose={() => setEditing(false)} initial={contact} {...form} />}
      {merging && <MergeDialog table="contacts" id={contact.id} name={contact.name} onClose={() => setMerging(false)} t={t} />}
    </div>
  );
}

// Personal data: the person's right of access (export everything) and to
// be forgotten (erase for good). The one place that asks first (the kit's
// Confirm): nothing can bring it back, and that is the point.
export function PrivacyPanel({ id, name, canDelete, t }: { id: string; name: string; canDelete: boolean; t: Words<"contact" | "common"> }) {
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();
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
          const r = await call("deleteContact", { id }, { refresh: false });
          if (!r.ok) return;
          setDeleting(false);
          toast(t.contact.deleted);
          await navigate("/chest/contacts");
        })} />
    </section>
  );
}

// A contact a form made whose phone is another contact's, under another
// name (lib/from-forms.ts): maybe one person, maybe two sharing a line.
// Merge them, or keep them apart — a person decides, never the tool.
export function MaybeSame({ id, name, other, canMerge, canEdit, t }: { id: string; name: string; other: { id: string; name: string }; canMerge: boolean; canEdit: boolean; t: Words<"maybeSame" | "common" | "deal" | "dialog"> }) {
  const [merging, setMerging] = useState(false);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
    if (gone) return null;
  return (
    <div className="notice warn maybe-same" role="status">
      <span>{(() => {
        // The other contact's name opens their page.
        const [before, after = ""] = t.maybeSame.notice.split("{name}");
        return <>{before}<a href={`/chest/contacts/${other.id}`}>{other.name}</a>{after}</>;
      })()}</span>
      <span className="spacer" />
      {canMerge && <button type="button" className="button small" onClick={() => setMerging(true)}><Merge />{t.maybeSame.merge}</button>}
      {canEdit && <button type="button" className="button small quiet" disabled={pending} onClick={() => start(async () => {
        const r = await call("keepApart", { id });
        if (!r.ok) return;
        setGone(true);
        toast(t.maybeSame.apartDone);
      })}>{t.maybeSame.apart}</button>}
      {merging && <MergeDialog table="contacts" id={id} name={name} initial={other} onClose={() => setMerging(false)} t={t} />}
    </div>
  );
}
