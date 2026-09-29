"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { FieldDef } from "../../../lib/custom.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addDeal, updateDeal } from "../actions.ts";
import { CustomInputs } from "./custom-fields.tsx";
import { OwnerSelect } from "./owner-select.tsx";
import { CompanyPicker, ContactPicker } from "./pickers.tsx";
import type { Choice, Teammate } from "./shared.ts";
import type { DealValues } from "./values.ts";

export type DealFormProps = { fields: FieldDef[]; stages: Choice[]; team: Teammate[]; me: string; canAssign: boolean; canCreateCompany: boolean; t: Catalogue };

// Add or edit a deal: what, for whom, how much, by when. The company and
// the person are found by typing (a new company is added on the spot);
// choosing a person brings their company; choosing a company offers its
// people first.
export function DealDialog({ open, onClose, initial, fields, stages, team, me, canAssign, canCreateCompany, t }: DealFormProps & { open: boolean; onClose: () => void; initial: DealValues }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const editing = initial.id !== undefined;
  // The company of the person chosen (a person of another company does not
  // stay when the company changes); at first, the deal's own company.
  const [theirs, setTheirs] = useState<string | null>(initial.contact ? initial.company?.id ?? null : null);
  function submit() {
    setError(null);
    start(async () => {
      const common = { title: v.title, company: v.company?.id ?? null, contact: v.contact?.id ?? null, value: v.value, expectedClose: v.expectedClose || null, custom: v.custom };
      const r = editing ? await updateDeal(initial.id!, common) : await addDeal({ ...common, stage: v.stage, owner: v.owner });
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      onClose();
      if (!editing && r.value) {
        toast(t.deal.created);
        router.push(`/chest/deals/${(r.value as { id: string }).id}`);
      } else toast(t.common.saved);
    });
  }
  return (
    <Dialog open={open} title={editing ? t.deal.edit : t.deal.newTitle} closeLabel={t.common.close} onClose={onClose}>
      <form className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="field-block">
          <label className="label" htmlFor="dl-title">{t.deal.titleLabel}</label>
          <input id="dl-title" className="field" value={v.title} onChange={e => setV(x => ({ ...x, title: e.target.value }))} maxLength={160} required autoFocus placeholder={t.deal.titlePlaceholder} />
        </div>
        <div className="form-grid">
          <div className="field-block">
            <label className="label" htmlFor="dl-company">{t.deal.company}</label>
            <CompanyPicker id="dl-company" value={v.company} canCreate={canCreateCompany} t={t}
              onChange={company => setV(x => ({ ...x, company, contact: company && x.contact && theirs && theirs !== company.id ? null : x.contact }))} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="dl-contact">{t.deal.contact}</label>
            <ContactPicker id="dl-contact" value={v.contact} company={v.company?.id ?? null} t={t}
              onChange={contact => {
                setTheirs(contact?.companyId ?? null);
                setV(x => ({ ...x, contact, company: contact?.companyId ? { id: contact.companyId, name: contact.companyName ?? "" } : x.company }));
              }} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="dl-value">{t.deal.valueLabel}</label>
            <input id="dl-value" className="field num" value={v.value} onChange={e => setV(x => ({ ...x, value: e.target.value }))} inputMode="decimal" maxLength={24} placeholder={t.deal.valuePlaceholder} />
          </div>
          <div className="field-block">
            <label className="label" htmlFor="dl-close">{t.deal.close}</label>
            <input id="dl-close" className="field" type="date" value={v.expectedClose} onChange={e => setV(x => ({ ...x, expectedClose: e.target.value }))} />
          </div>
          {!editing && (
            <div className="field-block">
              <label className="label" htmlFor="dl-stage">{t.deal.stage}</label>
              <select id="dl-stage" className="field" value={v.stage} onChange={e => setV(x => ({ ...x, stage: e.target.value }))}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {!editing && (
            <div className="field-block">
              <label className="label" htmlFor="dl-owner">{t.deal.owner}</label>
              <OwnerSelect id="dl-owner" value={v.owner} team={team} me={me} canAssign={canAssign} onChange={owner => setV(x => ({ ...x, owner }))} t={t} />
            </div>
          )}
        </div>
        <CustomInputs fields={fields} values={v.custom} onChange={custom => setV(x => ({ ...x, custom }))} prefix="dl" t={t} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.deal.create}</button>
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A button that opens the dialog, for the pages that offer "New deal".
export function NewDealButton({ label, className = "button", initial, ...rest }: DealFormProps & { label: string; className?: string; initial: DealValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      {open && <DealDialog open={open} onClose={() => setOpen(false)} initial={initial} {...rest} />}
    </>
  );
}
