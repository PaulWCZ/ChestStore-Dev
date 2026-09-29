"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { checkBic, checkIban, groupIban } from "../lib/iban.ts";
import { limits } from "../lib/model.ts";
import { removeBank, saveBank } from "../app/chest/actions.ts";
import { Check } from "./icons.tsx";

export type BankCurrent = { masked: string; bic: string | null; holder: string; since: string } | null;
type Words = Catalogue["settings"]["bank"];

// Bank details, for oneself ("me"), a person (an accountant, from "To pay
// back") or the company. Once saved, only the masked account shows; the
// IBAN is checked while it is typed (country, length, check digits), and
// again on the server. `onDirty` says when an IBAN is being typed (a
// dialog around it then asks before closing).
export function BankForm({ owner, current, t, errors, save, cancel, holder = true, idPrefix = "bank", onDirty, onDone }: {
  owner: string;
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
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState(current?.bic ?? "");
  const [name, setName] = useState(current?.holder ?? "");
  const [error, setError] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const dirty = editing && iban.trim() !== "";
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  // What is wrong with the IBAN typed, once it looks complete.
  const typed = iban.replace(/\s/gu, "");
  const check = typed.length >= 15 ? checkIban(iban) : null;
  const ibanError = check && !check.ok ? (check.reason === "checksum" ? errors.iban_checksum : errors.iban_invalid) : null;
  const bicError = bic.trim() !== "" && checkBic(bic) === null ? errors.bic_invalid : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!check?.ok) return setError(ibanError ?? errors.iban_invalid);
    if (bicError) return setError(bicError);
    setError(null);
    start(async () => {
      const result = await saveBank(owner, { iban, bic, holder: name });
      if (!result.ok) return setError(format(errors[result.error], result.values ?? {}));
      setIban("");
      setEditing(false);
      toast({ id: `bank-${owner}`, text: t.saved });
      onDone?.();
      router.refresh();
    });
  }

  // Erasing bank details cannot be undone (they are not kept anywhere):
  // it asks first, in the page.
  function erase() {
    start(async () => {
      const result = await removeBank(owner);
      setErasing(false);
      if (!result.ok) return void toast({ text: format(errors[result.error], result.values ?? {}), tone: "error" });
      toast({ id: `bank-${owner}`, text: t.removed });
      setEditing(true);
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
        </div>
        <div className="actions-bar">
          <button type="button" className="button quiet small" onClick={() => setEditing(true)}>{t.replace}</button>
          <button type="button" className="button danger small" onClick={() => setErasing(true)} disabled={pending}>{t.remove}</button>
        </div>
        <Confirm open={erasing} title={t.eraseTitle} body={format(t.eraseBody, { masked: current.masked })} confirmLabel={t.remove} cancelLabel={cancel} busy={pending} onConfirm={erase} onCancel={() => setErasing(false)} />
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <div className="field-row">
        <label htmlFor={`${idPrefix}-iban`}>{t.iban}</label>
        <div className="iban-input">
          <input id={`${idPrefix}-iban`} className="field mono" value={iban} onChange={e => setIban(e.target.value)} onBlur={() => check?.ok && setIban(groupIban(check.iban))}
            autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={50} placeholder={t.ibanPlaceholder}
            aria-invalid={ibanError !== null} aria-describedby={`${idPrefix}-iban-hint`} />
          {check?.ok && <span className="ok" aria-hidden="true"><Check /></span>}
        </div>
        <span id={`${idPrefix}-iban-hint`} className={ibanError ? "error" : "hint"}>{ibanError ?? t.ibanHint}</span>
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
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions-bar">
        <button type="submit" className="button" disabled={pending}>{save}</button>
        {current && <button type="button" className="button quiet" onClick={() => { setEditing(false); setError(null); }}>{cancel}</button>}
      </div>
    </form>
  );
}
