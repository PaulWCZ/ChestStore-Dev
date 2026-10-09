import { call, navigate, toast } from "@argentic/chest-app/client";
import { DateField, Dialog } from "@argentic/chest-ui/components";
import { useId, useState, useTransition } from "react";
import type { FieldDef } from "../shared/custom.ts";
import { format } from "../i18n/format.ts";
import { CustomInputs } from "./custom-fields.tsx";
import { Plus } from "./icons.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import { CompanyPicker, ContactPicker } from "./pickers.tsx";
import type { Choice, Teammate, Words } from "./shared.ts";
import type { DealValues } from "./values.ts";

export type DealWords = OwnerWords & Words<"deal" | "common" | "dialog" | "date">;
export type DealFormProps = { fields: FieldDef[]; stages: Choice[]; team: Teammate[]; me: string; canAssign: boolean; canCreateCompany: boolean; today: string; currency: string; t: DealWords };

// Add or edit a deal: what, for whom, how much, by when. The company and
// the person are found by typing (a new company is added on the spot);
// choosing a person brings their company; choosing a company offers its
// people first.
export function DealDialog({ open, onClose, initial, fields, stages, team, me, canAssign, canCreateCompany, today, currency, t }: DealFormProps & { open: boolean; onClose: () => void; initial: DealValues }) {
  const [v, setV] = useState(initial);
  const formId = useId();
  // Something typed: closing asks first (the kit's Dialog).
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const [error, setError] = useState<string | null>(null);
  // A refused amount is said under the Amount field itself.
  const [amountError, setAmountError] = useState<string | null>(null);
  const [pending, start] = useTransition();
    const editing = initial.id !== undefined;
  // The company of the person chosen (a person of another company does not
  // stay when the company changes); at first, the deal's own company.
  const [theirs, setTheirs] = useState<string | null>(initial.contact ? initial.company?.id ?? null : null);
  function submit() {
    setError(null);
    setAmountError(null);
    start(async () => {
      const common = { title: v.title, company: v.company?.id ?? null, contact: v.contact?.id ?? null, value: v.value, expectedClose: v.expectedClose || null, custom: v.custom };
      const r = editing ? await call("updateDeal", { id: initial.id!, ...common }, { quiet: true }) : await call("addDeal", { ...common, ...(v.stage ? { stage: v.stage } : {}), owner: v.owner }, { quiet: true, refresh: false });
      if (!r.ok) return r.error === "bad_amount" || r.error === "amount_ambiguous" ? setAmountError(r.message) : setError(r.message);
      onClose();
      if (!editing && r.value) {
        toast(t.deal.created);
        await navigate(`/chest/deals/${r.value.id}`);
      } else toast(t.common.saved);
    });
  }
  return (
    <Dialog open={open} title={editing ? t.deal.edit : t.deal.newTitle} onClose={onClose} dirty={dirty} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending}>{pending ? t.common.saving : editing ? t.common.save : t.deal.create}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => { e.preventDefault(); submit(); }}>
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
            <label className="label" htmlFor="dl-value">{format(t.deal.valueLabel, { currency })}</label>
            <input id="dl-value" className="field num" value={v.value} onChange={e => { setAmountError(null); setV(x => ({ ...x, value: e.target.value })); }} inputMode="decimal" maxLength={24} placeholder={t.deal.valuePlaceholder} aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? "dl-value-error" : undefined} />
            {amountError && <p className="error" id="dl-value-error" role="alert">{amountError}</p>}
          </div>
          <DateField id="dl-close" label={t.deal.close} value={v.expectedClose || null} onChange={day => setV(x => ({ ...x, expectedClose: day ?? "" }))} today={today} chips={false} labels={t.date} />
          {!editing && (
            <div className="field-block">
              <label className="label" htmlFor="dl-stage">{t.deal.stage}</label>
              <select id="dl-stage" className="field" value={v.stage} onChange={e => setV(x => ({ ...x, stage: e.target.value }))}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {!editing && (
            <OwnerPicker id="dl-owner" label={t.deal.owner} value={v.owner} team={team} me={me} canAssign={canAssign} onChange={owner => setV(x => ({ ...x, owner }))} t={t} />
          )}
        </div>
        <CustomInputs fields={fields} values={v.custom} onChange={custom => setV(x => ({ ...x, custom }))} prefix="dl" today={today} t={t} />
        {error && <p className="error" role="alert">{error}</p>}
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
