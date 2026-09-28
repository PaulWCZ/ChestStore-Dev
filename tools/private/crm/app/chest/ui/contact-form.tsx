"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addContact, updateContact } from "../actions.ts";
import { Lookalikes } from "./lookalikes.tsx";
import { OwnerSelect } from "./owner-select.tsx";
import type { ContactValues } from "./values.ts";
import type { Choice, Teammate } from "./shared.ts";


// Add or edit a person: name, then how to reach them and where they work.
export function ContactDialog({ open, onClose, initial, companies, team, me, canAssign, stay = false, t }: { open: boolean; onClose: () => void; initial: ContactValues; companies: Choice[]; team: Teammate[]; me: string; canAssign: boolean; stay?: boolean; t: Catalogue }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = (key: keyof ContactValues) => (e: { target: { value: string } }) => setV(x => ({ ...x, [key]: e.target.value }));
  const editing = initial.id !== undefined;
  function submit() {
    setError(null);
    start(async () => {
      const input = { name: v.name, email: v.email, phone: v.phone, title: v.title, company: v.company, notes: v.notes, tags: v.tags, owner: v.owner };
      const r = editing ? await updateContact(initial.id!, input) : await addContact(input);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      onClose();
      if (!editing && r.value && !stay) {
        toast(t.contact.created);
        router.push(`/chest/contacts/${(r.value as { id: string }).id}`);
      } else toast(editing ? t.common.saved : t.contact.created);
    });
  }
  return (
    <Dialog open={open} title={editing ? t.contact.edit : t.contact.newTitle} closeLabel={t.common.close} onClose={onClose}>
      <form className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="field-block">
          <label className="label" htmlFor="ct-name">{t.contact.name}</label>
          <input id="ct-name" className="field" value={v.name} onChange={set("name")} maxLength={160} required autoFocus placeholder={t.contact.namePlaceholder} autoComplete="off" />
        </div>
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="ct-email">{t.contact.email}</label>
            <input id="ct-email" className="field" type="email" value={v.email} onChange={set("email")} maxLength={254} autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-phone">{t.contact.phone}</label>
            <input id="ct-phone" className="field" value={v.phone} onChange={set("phone")} maxLength={40} inputMode="tel" autoComplete="off" />
          </div>
        </div>
        <Lookalikes kind="contact" name={v.name} email={v.email} {...(initial.id ? { except: initial.id } : {})} t={t} />
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="ct-company">{t.contact.company}</label>
            <select id="ct-company" className="field" value={v.company ?? ""} onChange={e => setV(x => ({ ...x, company: e.target.value || null }))}>
              <option value="">{t.contact.noCompany}</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-title">{t.contact.title}</label>
            <input id="ct-title" className="field" value={v.title} onChange={set("title")} maxLength={120} placeholder={t.contact.titlePlaceholder} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-owner">{t.common.owner}</label>
            <OwnerSelect id="ct-owner" value={v.owner} team={team} me={me} canAssign={canAssign} onChange={owner => setV(x => ({ ...x, owner }))} t={t} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-tags">{t.common.tags} <span className="hint">{t.common.tagsHint}</span></label>
            <input id="ct-tags" className="field" value={v.tags} onChange={set("tags")} maxLength={400} />
          </div>
        </div>
        <div className="field-block">
          <label className="label" htmlFor="ct-notes">{t.common.notes}</label>
          <textarea id="ct-notes" className="field" rows={3} value={v.notes} onChange={set("notes")} maxLength={5000} aria-describedby="ct-notes-hint" />
          <span className="hint" id="ct-notes-hint">{t.common.notesHint}</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.contact.create}</button>
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A button that opens the dialog.
export function NewContactButton({ label, className = "button", initial, ...rest }: { label: string; className?: string; initial: ContactValues; companies: Choice[]; stay?: boolean; team: Teammate[]; me: string; canAssign: boolean; t: Catalogue }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      {open && <ContactDialog open={open} onClose={() => setOpen(false)} initial={initial} {...rest} />}
    </>
  );
}
