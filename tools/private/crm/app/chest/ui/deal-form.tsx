"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addDeal, updateDeal } from "../actions.ts";
import { OwnerSelect } from "./owner-select.tsx";
import type { DealValues } from "./values.ts";
import type { Choice, ContactChoice, Teammate } from "./shared.ts";


// Add or edit a deal: what, for whom, how much, by when. Choosing a person
// brings their company; choosing a company keeps only its people.
export function DealDialog({ open, onClose, initial, companies, contacts, stages, team, me, canAssign, t }: { open: boolean; onClose: () => void; initial: DealValues; companies: Choice[]; contacts: ContactChoice[]; stages: Choice[]; team: Teammate[]; me: string; canAssign: boolean; t: Catalogue }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const editing = initial.id !== undefined;
  const people = v.company ? contacts.filter(c => c.companyId === v.company || c.companyId === null) : contacts;
  function submit() {
    setError(null);
    start(async () => {
      const common = { title: v.title, company: v.company, contact: v.contact, value: v.value, expectedClose: v.expectedClose || null };
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
            <select id="dl-company" className="field" value={v.company ?? ""} onChange={e => {
              const company = e.target.value || null;
              setV(x => ({ ...x, company, contact: x.contact && contacts.find(c => c.id === x.contact)?.companyId !== company && company !== null ? null : x.contact }));
            }}>
              <option value="">{t.deal.noCompany}</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label className="label" htmlFor="dl-contact">{t.deal.contact}</label>
            <select id="dl-contact" className="field" value={v.contact ?? ""} onChange={e => {
              const contact = e.target.value || null;
              const theirs = contacts.find(c => c.id === contact)?.companyId ?? null;
              setV(x => ({ ...x, contact, company: theirs ?? x.company }));
            }}>
              <option value="">{t.deal.noContact}</option>
              {people.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
export function NewDealButton({ label, className = "button", initial, ...rest }: { label: string; className?: string; initial: DealValues; companies: Choice[]; contacts: ContactChoice[]; stages: Choice[]; team: Teammate[]; me: string; canAssign: boolean; t: Catalogue }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Plus />{label}</button>
      {open && <DealDialog open={open} onClose={() => setOpen(false)} initial={initial} {...rest} />}
    </>
  );
}
