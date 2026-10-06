import { call, navigate, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useId, useState, useTransition } from "react";
import type { FieldDef } from "../shared/custom.ts";
import { CustomInputs } from "./custom-fields.tsx";
import { Plus } from "./icons.tsx";
import { Lookalikes } from "./lookalikes.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import { CompanyPicker } from "./pickers.tsx";
import type { Teammate, Words } from "./shared.ts";
import type { ContactValues } from "./values.ts";

export type ContactWords = OwnerWords & Words<"contact" | "common" | "dialog" | "date" | "deal">;
export type ContactFormProps = { fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; canCreate: boolean; stay?: boolean; today: string; t: ContactWords };


// Add or edit a person: name, then how to reach them and where they work.
export function ContactDialog({ open, onClose, initial, fields, team, me, canAssign, canCreate, stay = false, today, t }: ContactFormProps & { open: boolean; onClose: () => void; initial: ContactValues }) {
  const [v, setV] = useState(initial);
  const formId = useId();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
    const set = (key: Exclude<keyof ContactValues, "custom" | "owner" | "id" | "company">) => (e: { target: { value: string } }) => setV(x => ({ ...x, [key]: e.target.value }));
  const editing = initial.id !== undefined;
  function submit() {
    setError(null);
    start(async () => {
      const input = { name: v.name, email: v.email, phone: v.phone, phone2: v.phone2, url: v.url, title: v.title, company: v.company?.id ?? null, notes: v.notes, tags: v.tags, owner: v.owner, custom: v.custom };
      const r = editing ? await call("updateContact", { id: initial.id!, ...input }, { quiet: true }) : await call("addContact", input, { quiet: true, refresh: stay });
      if (!r.ok) return setError(r.message);
      onClose();
      if (!editing && r.value && !stay) {
        toast(t.contact.created);
        await navigate(`/chest/contacts/${r.value.id}`);
      } else toast(editing ? t.common.saved : t.contact.created);
    });
  }
  return (
    <Dialog open={open} title={editing ? t.contact.edit : t.contact.newTitle} onClose={onClose} dirty={dirty} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.contact.create}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
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
          <div className="field-block">
            <label className="label" htmlFor="ct-phone2">{t.contact.phone2}</label>
            <input id="ct-phone2" className="field" value={v.phone2} onChange={set("phone2")} maxLength={40} inputMode="tel" autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-url">{t.contact.url}</label>
            <input id="ct-url" className="field" value={v.url} onChange={set("url")} maxLength={200} inputMode="url" autoComplete="off" />
          </div>
        </div>
        <Lookalikes kind="contact" name={v.name} email={v.email} {...(initial.id ? { except: initial.id } : {})} t={t} />
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="ct-company">{t.contact.company}</label>
            <CompanyPicker id="ct-company" value={v.company} onChange={company => setV(x => ({ ...x, company }))} canCreate={canCreate} t={t} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="ct-title">{t.contact.title}</label>
            <input id="ct-title" className="field" value={v.title} onChange={set("title")} maxLength={120} placeholder={t.contact.titlePlaceholder} />
          </div>
          <OwnerPicker id="ct-owner" label={t.common.owner} value={v.owner} team={team} me={me} canAssign={canAssign} onChange={owner => setV(x => ({ ...x, owner }))} t={t} />
          <div className="field-block">
            <label className="label" htmlFor="ct-tags">{t.common.tags} <span className="hint">{t.common.tagsHint}</span></label>
            <input id="ct-tags" className="field" value={v.tags} onChange={set("tags")} maxLength={400} />
          </div>
        </div>
        <CustomInputs fields={fields} values={v.custom} onChange={custom => setV(x => ({ ...x, custom }))} prefix="ct" today={today} t={t} />
        <div className="field-block">
          <label className="label" htmlFor="ct-notes">{t.common.notes}</label>
          <textarea id="ct-notes" className="field" rows={3} value={v.notes} onChange={set("notes")} maxLength={5000} aria-describedby="ct-notes-hint" />
          <span className="hint" id="ct-notes-hint">{t.common.notesHint}</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

// A button that opens the dialog.
export function NewContactButton({ label, className = "button", initial, ...rest }: ContactFormProps & { label: string; className?: string; initial: ContactValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      {open && <ContactDialog open={open} onClose={() => setOpen(false)} initial={initial} {...rest} />}
    </>
  );
}
