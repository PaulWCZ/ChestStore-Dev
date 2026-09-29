"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useEffect, useState } from "react";
import { addClient, updateClient } from "../app/chest/actions.ts";
import { format, languageNames } from "../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import type { Client } from "../lib/clients.ts";

// A client's card: who they are, where to send, what the law prints. Used
// to add one (from the list, or while writing a document) and to change one.
// `onDirty` says whether something was typed (a dialog around it then asks
// before closing).
export type ClientFields = { kind: "company" | "person"; name: string; contact: string; email: string; phone: string; address: string; postcode: string; city: string; country: string; deliveryAddress: string; siren: string; vatNumber: string; language: Locale; reverseCharge: boolean; notes: string; account: string };

export const blankClient = (language: Locale): ClientFields => ({ kind: "company", name: "", contact: "", email: "", phone: "", address: "", postcode: "", city: "", country: "FR", deliveryAddress: "", siren: "", vatNumber: "", language, reverseCharge: false, notes: "", account: "" });

const fieldOf: Record<string, keyof ClientFields> = { siren_invalid: "siren", vat_number_invalid: "vatNumber", email_invalid: "email", country_invalid: "country", empty: "name", account_invalid: "account" };

export function ClientForm({ t, initial, id, onSaved, onCancel, onDirty, compact = false, readOnly = false }: { t: Catalogue; initial: ClientFields; id?: string; onSaved: (client: Client) => void; onCancel?: () => void; onDirty?: (dirty: boolean) => void; compact?: boolean; readOnly?: boolean }) {
  const [f, setF] = useState(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const [error, setError] = useState<{ field: keyof ClientFields | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const w = t.clientForm;
  const set = (patch: Partial<ClientFields>) => setF(v => ({ ...v, ...patch }));
  const invalid = (field: keyof ClientFields) => (error?.field === field ? true : undefined);
  const eu = f.country !== "FR" && f.vatNumber !== "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = id ? await updateClient(id, f) : await addClient(f);
    setBusy(false);
    if (!result.ok) {
      setError({ field: fieldOf[result.error] ?? null, text: format(t.errors[result.error], result.values ?? {}) });
      return;
    }
    setError(null);
    if (id) toast({ id: `client-${id}`, text: w.saved });
    onSaved(result.value);
  }
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <fieldset className="choice" disabled={readOnly}>
        <legend>{w.kind}</legend>
        <div className="two-col">
          <label className="option"><input type="radio" name="kind" checked={f.kind === "company"} onChange={() => set({ kind: "company" })} /><span>{w.company}</span><span className="sub">{w.companyHint}</span></label>
          <label className="option"><input type="radio" name="kind" checked={f.kind === "person"} onChange={() => set({ kind: "person" })} /><span>{w.person}</span><span className="sub">{w.personHint}</span></label>
        </div>
      </fieldset>
      <div className="field-row two-thirds">
        <label htmlFor="c-name">{f.kind === "company" ? w.companyName : w.personName}</label>
        <input id="c-name" className="field" value={f.name} maxLength={160} required readOnly={readOnly} aria-invalid={invalid("name")} onChange={e => set({ name: e.target.value })} autoFocus={!id && !readOnly} />
      </div>
      <div className="field-row third">
        <label htmlFor="c-language">{w.language}</label>
        <select id="c-language" className="field" value={f.language} disabled={readOnly} onChange={e => set({ language: e.target.value as Locale })}>
          {(Object.keys(languageNames) as Locale[]).map(code => <option key={code} value={code}>{languageNames[code] ?? code}</option>)}
        </select>
      </div>
      {f.kind === "company" && (
        <div className="field-row half">
          <label htmlFor="c-contact">{w.contact}</label>
          <input id="c-contact" className="field" value={f.contact} maxLength={120} readOnly={readOnly} onChange={e => set({ contact: e.target.value })} />
        </div>
      )}
      <div className="field-row half">
        <label htmlFor="c-email">{w.email}</label>
        <input id="c-email" className="field" type="email" value={f.email} maxLength={254} readOnly={readOnly} aria-invalid={invalid("email")} aria-describedby="c-email-hint" onChange={e => set({ email: e.target.value })} />
        <span className="hint" id="c-email-hint">{w.emailHint}</span>
      </div>
      <div className="field-row">
        <label htmlFor="c-address">{w.address}</label>
        <textarea id="c-address" className="field" rows={2} value={f.address} maxLength={300} readOnly={readOnly} onChange={e => set({ address: e.target.value })} />
      </div>
      <div className="field-row third">
        <label htmlFor="c-postcode">{w.postcode}</label>
        <input id="c-postcode" className="field" value={f.postcode} maxLength={12} readOnly={readOnly} autoComplete="off" onChange={e => set({ postcode: e.target.value })} />
      </div>
      <div className="field-row third">
        <label htmlFor="c-city">{w.city}</label>
        <input id="c-city" className="field" value={f.city} maxLength={80} readOnly={readOnly} onChange={e => set({ city: e.target.value })} />
      </div>
      <div className="field-row third">
        <label htmlFor="c-country">{w.country}</label>
        <input id="c-country" className="field" value={f.country} maxLength={2} readOnly={readOnly} aria-invalid={invalid("country")} aria-describedby="c-country-hint" onChange={e => set({ country: e.target.value.toUpperCase() })} />
        <span className="hint" id="c-country-hint">{w.countryHint}</span>
      </div>
      {f.kind === "company" && (
        <>
          <div className="field-row half">
            <label htmlFor="c-siren">{w.siren}</label>
            <input id="c-siren" className="field" inputMode="numeric" value={f.siren} maxLength={14} readOnly={readOnly} aria-invalid={invalid("siren")} aria-describedby="c-siren-hint" onChange={e => set({ siren: e.target.value })} />
            <span className="hint" id="c-siren-hint">{w.sirenHint}</span>
          </div>
          <div className="field-row half">
            <label htmlFor="c-vat">{w.vatNumber}</label>
            <input id="c-vat" className="field" value={f.vatNumber} maxLength={20} readOnly={readOnly} aria-invalid={invalid("vatNumber")} onChange={e => set({ vatNumber: e.target.value })} />
          </div>
          <label className="check">
            <input type="checkbox" checked={f.reverseCharge} disabled={readOnly} onChange={e => set({ reverseCharge: e.target.checked })} />
            <span>{w.reverseCharge}<br /><span className="hint">{eu ? w.reverseChargeHintEu : w.reverseChargeHint}</span></span>
          </label>
        </>
      )}
      {!compact && (
        <>
          <div className="field-row half">
            <label htmlFor="c-phone">{w.phone}</label>
            <input id="c-phone" className="field" type="tel" value={f.phone} maxLength={40} readOnly={readOnly} onChange={e => set({ phone: e.target.value })} />
          </div>
          <div className="field-row half">
            <label htmlFor="c-delivery">{w.deliveryAddress}</label>
            <textarea id="c-delivery" className="field" rows={2} value={f.deliveryAddress} maxLength={300} readOnly={readOnly} onChange={e => set({ deliveryAddress: e.target.value })} />
          </div>
          <div className="field-row third">
            <label htmlFor="c-account">{w.account}</label>
            <input id="c-account" className="field" value={f.account} maxLength={20} readOnly={readOnly} aria-invalid={invalid("account")} aria-describedby="c-account-hint" onChange={e => set({ account: e.target.value.toUpperCase() })} />
            <span className="hint" id="c-account-hint">{w.accountHint}</span>
          </div>
          <div className="field-row two-thirds">
            <label htmlFor="c-notes">{w.notes}</label>
            <textarea id="c-notes" className="field" rows={2} value={f.notes} maxLength={4000} readOnly={readOnly} onChange={e => set({ notes: e.target.value })} />
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error.text}</p>}
      {!readOnly && (
        <div className="dialog-actions">
          {onCancel && <button type="button" className="button quiet" onClick={onCancel}>{t.common.cancel}</button>}
          <button type="submit" className="button" disabled={busy}>{id ? w.save : w.add}</button>
        </div>
      )}
    </form>
  );
}
