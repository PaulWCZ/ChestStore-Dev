"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { checkBic, checkIban, groupIban, needsAddress } from "../lib/iban.ts";
import { limits } from "../lib/model.ts";
import { removeBank, saveBank } from "../app/chest/actions.ts";
import { Check } from "./icons.tsx";

export type BankAddress = { street: string; postcode: string; town: string; country: string };
export type BankCurrent = { masked: string; country: string; bic: string | null; holder: string; since: string; address: BankAddress | null; needsAddress: boolean } | null;
type Words = Catalogue["settings"]["bank"];

// Bank details, for oneself ("me"), a person (an accountant, from "To pay
// back") or the company. Once saved, only the masked account shows; the
// IBAN is checked while it is typed (country, length, check digits), and
// again on the server. `onDirty` says when an IBAN is being typed (a
// dialog around it then asks before closing). Erasing asks first, in the
// kit's Confirm — inside a Dialog too (kit 0.2.2: each dialog answers only
// its own events); once erased, `onDone` (a dialog closes) or the empty
// form.
export function BankForm({ owner, current, t, errors, save, cancel, countries, holder = true, idPrefix = "bank", onDirty, onDone }: {
  owner: string;
  countries: { value: string; label: string }[];
  cancel: string;
  current: BankCurrent;
  t: Words;
  errors: Catalogue["errors"];
  save: string;
  holder?: boolean;
  idPrefix?: string;
  onDirty?: (dirty: boolean) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(current === null);
  const [erasing, setErasing] = useState(false);
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState(current?.bic ?? "");
  const [name, setName] = useState(current?.holder ?? "");
  const [street, setStreet] = useState(current?.address?.street ?? "");
  const [postcode, setPostcode] = useState(current?.address?.postcode ?? "");
  const [town, setTown] = useState(current?.address?.town ?? "");
  const [country, setCountry] = useState(current?.address?.country ?? "");
  const [error, setError] = useState<string | null>(null);
  const dirty = editing && iban.trim() !== "";
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  // What is wrong with the IBAN typed, once it looks complete.
  const typed = iban.replace(/\s/gu, "");
  const check = typed.length >= 15 ? checkIban(iban) : null;
  const ibanError = check && !check.ok ? (check.reason === "checksum" ? errors.iban_checksum : errors.iban_invalid) : null;
  const bicError = bic.trim() !== "" && checkBic(bic) === null ? errors.bic_invalid : null;
  // The address: needed for an account outside the EEA, offered for the
  // company's; its country is the account's until someone picks another.
  // With an account saved, the IBAN may stay as it is (left empty): only
  // the rest changes.
  const keepIban = current !== null && typed === "";
  const far = check?.ok ? needsAddress(check.country) : keepIban ? current.needsAddress : false;
  const showAddress = owner === "company" || far || (current?.address ?? null) !== null;
  const addressCountry = country || (check?.ok ? check.country : current?.country ?? "");
  const addressError = far && town.trim() === "" ? errors.address_needed : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!keepIban && !check?.ok) return setError(ibanError ?? errors.iban_invalid);
    if (bicError) return setError(bicError);
    if (addressError) return setError(addressError);
    setError(null);
    start(async () => {
      const result = await saveBank(owner, { iban, bic, holder: name, street, postcode, town, addressCountry: town.trim() === "" ? "" : addressCountry });
      if (!result.ok) return setError(format(errors[result.error], result.values ?? {}));
      setIban("");
      setEditing(false);
      toast({ id: `bank-${owner}`, text: t.saved });
      onDone?.();
      router.refresh();
    });
  }

  if (current && !editing) {
    return (
      <div className="bank-current">
        <div>
          <strong className="mono">{format(t.current, { masked: current.masked })}</strong>
          <div className="hint">{[current.holder, current.bic, format(t.since, { when: current.since })].filter(Boolean).join(" · ")}</div>
          {current.address && <div className="hint">{[current.address.street, `${current.address.postcode} ${current.address.town}`.trim(), countries.find(c => c.value === current.address!.country)?.label ?? current.address.country].filter(Boolean).join(", ")}</div>}
          {current.needsAddress && !current.address && <div className="error">{t.addressMissing}</div>}
        </div>
        <div className="actions-bar">
          <button type="button" className="button quiet small" onClick={() => setEditing(true)}>{t.replace}</button>
          <button type="button" className="button danger small" onClick={() => setErasing(true)} disabled={pending}>{t.remove}</button>
        </div>
        <EraseBank owner={erasing ? owner : null} masked={current.masked} t={t} errors={errors} cancel={cancel} onClose={() => setErasing(false)} onErased={() => (onDone ? onDone() : setEditing(true))} />
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <div className="field-row">
        <label htmlFor={`${idPrefix}-iban`}>{t.iban}</label>
        <div className="iban-input">
          <input id={`${idPrefix}-iban`} className="field mono" value={iban} onChange={e => { setIban(e.target.value); onDirty?.(e.target.value.trim() !== ""); }} onBlur={() => check?.ok && setIban(groupIban(check.iban))}
            autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={50} placeholder={t.ibanPlaceholder}
            aria-invalid={ibanError !== null} aria-describedby={`${idPrefix}-iban-hint`} />
          {check?.ok && <span className="ok" aria-hidden="true"><Check /></span>}
        </div>
        <span id={`${idPrefix}-iban-hint`} className={ibanError ? "error" : "hint"}>{ibanError ?? (current ? format(t.ibanKeep, { masked: current.masked }) : t.ibanHint)}</span>
      </div>
      <div className="two stack">
        <div className="field-row">
          <label htmlFor={`${idPrefix}-bic`}>{t.bic}</label>
          <input id={`${idPrefix}-bic`} className="field mono" value={bic} onChange={e => setBic(e.target.value)} autoComplete="off" spellCheck={false} maxLength={14} aria-invalid={bicError !== null} />
        </div>
        {holder && (
          <div className="field-row">
            <label htmlFor={`${idPrefix}-holder`}>{t.holder}</label>
            <input id={`${idPrefix}-holder`} className="field" value={name} onChange={e => setName(e.target.value)} maxLength={limits.holder} autoComplete="off" />
          </div>
        )}
      </div>
      {showAddress && (
        <fieldset className="address">
          <legend className="field-label">{owner === "company" ? t.companyAddress : t.address}</legend>
          <p className="hint" id={`${idPrefix}-address-hint`}>{far ? t.addressWhy : owner === "company" ? t.companyAddressWhy : t.addressOptional}</p>
          <div className="field-row">
            <label htmlFor={`${idPrefix}-street`}>{t.street}</label>
            <input id={`${idPrefix}-street`} className="field" value={street} onChange={e => setStreet(e.target.value)} maxLength={limits.street} autoComplete="off" />
          </div>
          <div className="two stack">
            <div className="field-row">
              <label htmlFor={`${idPrefix}-postcode`}>{t.postcode}</label>
              <input id={`${idPrefix}-postcode`} className="field" value={postcode} onChange={e => setPostcode(e.target.value)} maxLength={limits.postcode} autoComplete="off" />
            </div>
            <div className="field-row">
              <label htmlFor={`${idPrefix}-town`}>{far ? t.townNeeded : t.town}</label>
              <input id={`${idPrefix}-town`} className="field" value={town} onChange={e => setTown(e.target.value)} maxLength={limits.town} autoComplete="off" aria-invalid={error !== null && addressError !== null} aria-describedby={`${idPrefix}-address-hint`} />
            </div>
          </div>
          <div className="field-row">
            <label htmlFor={`${idPrefix}-country`}>{t.country}</label>
            <select id={`${idPrefix}-country`} className="field" value={addressCountry} onChange={e => setCountry(e.target.value)}>
              <option value="">—</option>
              {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </fieldset>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions-bar">
        <button type="submit" className="button" disabled={pending}>{save}</button>
        {current && <button type="button" className="button quiet" onClick={() => { setEditing(false); setError(null); }}>{cancel}</button>}
      </div>
    </form>
  );
}

// Erasing bank details cannot be undone (they are not kept anywhere): it
// asks first, in the page (the kit's Confirm), naming the account.
function EraseBank({ owner, masked, t, errors, cancel, onClose, onErased }: { owner: string | null; masked: string; t: Words; errors: Catalogue["errors"]; cancel: string; onClose: () => void; onErased?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  function erase() {
    if (!owner) return;
    start(async () => {
      const result = await removeBank(owner);
      onClose();
      if (!result.ok) return void toast({ text: format(errors[result.error], result.values ?? {}), tone: "error" });
      toast({ id: `bank-${owner}`, text: t.removed });
      onErased?.();
      router.refresh();
    });
  }
  return <Confirm open={owner !== null} title={t.eraseTitle} body={format(t.eraseBody, { masked })} confirmLabel={t.remove} cancelLabel={cancel} busy={pending} onConfirm={erase} onCancel={onClose} />;
}
