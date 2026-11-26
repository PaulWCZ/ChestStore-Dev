import { call, navigate, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useId, useState, useTransition } from "react";
import type { FieldDef } from "../shared/custom.ts";
import { CustomInputs } from "./custom-fields.tsx";
import { Plus } from "./icons.tsx";
import { Lookalikes } from "./lookalikes.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import type { Teammate, Words } from "./shared.ts";
import type { CompanyValues } from "./values.ts";

export type CompanyWords = OwnerWords & Words<"company" | "common" | "dialog" | "date">;
// The countries a company may be in, named in the reader's language and
// in their order (written by the server: lib/countries.ts).
export type Country = { code: string; name: string };
export type CompanyFormProps = { fields: FieldDef[]; team: Teammate[]; me: string; canAssign: boolean; today: string; countries: Country[]; t: CompanyWords };


// Add or edit a company: the name first, the rest if known. A new one
// opens its page.
export function CompanyDialog({ open, onClose, initial, fields, team, me, canAssign, today, countries, t }: CompanyFormProps & { open: boolean; onClose: () => void; initial: CompanyValues }) {
  const [v, setV] = useState(initial);
  const formId = useId();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
    const set = (key: Exclude<keyof CompanyValues, "custom" | "owner" | "id">) => (e: { target: { value: string } }) => setV(x => ({ ...x, [key]: e.target.value }));
  const editing = initial.id !== undefined;
  function submit() {
    setError(null);
    start(async () => {
      const input = { name: v.name, website: v.website, phone: v.phone, email: v.email, address: v.address, postcode: v.postcode, city: v.city, country: v.country, siren: v.siren, vat: v.vat, industry: v.industry, notes: v.notes, tags: v.tags, owner: v.owner, custom: v.custom };
      const r = editing ? await call("updateCompany", { id: initial.id!, ...input }, { quiet: true }) : await call("addCompany", input, { quiet: true, refresh: false });
      if (!r.ok) return setError(r.message);
      onClose();
      if (!editing && r.value) {
        toast(t.company.created);
        await navigate(`/chest/companies/${r.value.id}`);
      } else toast(t.common.saved);
    });
  }
  return (
    <Dialog open={open} title={editing ? t.company.edit : t.company.newTitle} onClose={onClose} dirty={dirty} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.company.create}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="field-block">
          <label className="label" htmlFor="co-name">{t.company.name}</label>
          <input id="co-name" className="field" value={v.name} onChange={set("name")} maxLength={160} required autoFocus placeholder={t.company.namePlaceholder} />
        </div>
        <Lookalikes kind="company" name={v.name} website={v.website} {...(initial.id ? { except: initial.id } : {})} t={t} />
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="co-website">{t.company.website}</label>
            <input id="co-website" className="field" value={v.website} onChange={set("website")} maxLength={200} inputMode="url" placeholder={t.company.websitePlaceholder} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="co-phone">{t.company.phone}</label>
            <input id="co-phone" className="field" value={v.phone} onChange={set("phone")} maxLength={40} inputMode="tel" />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="co-email">{t.company.email}</label>
            <input id="co-email" className="field" type="email" value={v.email} onChange={set("email")} maxLength={254} autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="co-industry">{t.company.industry}</label>
            <input id="co-industry" className="field" value={v.industry} onChange={set("industry")} maxLength={80} placeholder={t.company.industryPlaceholder} />
          </div>
          <OwnerPicker id="co-owner" label={t.common.owner} value={v.owner} team={team} me={me} canAssign={canAssign} onChange={owner => setV(x => ({ ...x, owner }))} t={t} />
        </div>
        <fieldset className="field-group">
          <legend className="label">{t.company.address}</legend>
          <div className="field-block">
            <label className="visually-hidden" htmlFor="co-address">{t.company.street}</label>
            <textarea id="co-address" className="field" rows={2} value={v.address} onChange={set("address")} maxLength={300} placeholder={t.company.street} />
          </div>
          <div className="form-grid address-grid">
            <div className="field-block">
              <label className="label small-label" htmlFor="co-postcode">{t.company.postcode}</label>
              <input id="co-postcode" className="field" value={v.postcode} onChange={set("postcode")} maxLength={20} autoComplete="off" />
            </div>
            <div className="field-block">
              <label className="label small-label" htmlFor="co-city">{t.company.city}</label>
              <input id="co-city" className="field" value={v.city} onChange={set("city")} maxLength={80} autoComplete="off" />
            </div>
            <div className="field-block">
              <label className="label small-label" htmlFor="co-country">{t.company.country}</label>
              <select id="co-country" className="field" value={v.country} onChange={set("country")}>
                <option value="">{t.company.noCountry}</option>
                {v.country && !countries.some(c => c.code === v.country) && <option value={v.country}>{v.country}</option>}
                {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </fieldset>
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="co-siren">{t.company.siren}</label>
            <input id="co-siren" className="field num" value={v.siren} onChange={set("siren")} maxLength={20} inputMode="numeric" autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="co-vat">{t.company.vat}</label>
            <input id="co-vat" className="field num" value={v.vat} onChange={set("vat")} maxLength={20} autoComplete="off" placeholder={t.company.vatPlaceholder} />
          </div>
        </div>
        <CustomInputs fields={fields} values={v.custom} onChange={custom => setV(x => ({ ...x, custom }))} prefix="co" today={today} t={t} />
        <div className="field-block">
          <label className="label" htmlFor="co-tags">{t.common.tags} <span className="hint">{t.common.tagsHint}</span></label>
          <input id="co-tags" className="field" value={v.tags} onChange={set("tags")} maxLength={400} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="co-notes">{t.common.notes}</label>
          <textarea id="co-notes" className="field" rows={3} value={v.notes} onChange={set("notes")} maxLength={5000} aria-describedby="co-notes-hint" />
          <span className="hint" id="co-notes-hint">{t.common.notesHint}</span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

// A button that opens the dialog.
export function NewCompanyButton({ label, className = "button", initial, ...rest }: CompanyFormProps & { label: string; className?: string; initial: CompanyValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      {open && <CompanyDialog open={open} onClose={() => setOpen(false)} initial={initial} {...rest} />}
    </>
  );
}
