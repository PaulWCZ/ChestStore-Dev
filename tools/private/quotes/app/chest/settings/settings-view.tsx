"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Info, Trash, Upload } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Company } from "../../../lib/company.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { inputAmount, inputPercent } from "../../../lib/money.ts";
import { removeLogo, saveLogo, updateCompany } from "../actions.ts";

type Fields = Record<"legalName" | "tradeName" | "legalForm" | "capital" | "address" | "postcode" | "city" | "country" | "siren" | "siret" | "rcsCity" | "vatNumber" | "email" | "phone" | "website" | "bank" | "iban" | "bic" | "paymentDays" | "validityDays" | "penaltyRate" | "earlyDiscount" | "footer" | "quotePrefix" | "invoicePrefix" | "creditPrefix", string> & { franchise: boolean; vatOnDebits: boolean };

const fieldOf: Record<string, keyof Fields> = {
  siren_invalid: "siren", siret_invalid: "siret", vat_number_invalid: "vatNumber", iban_invalid: "iban", bic_invalid: "bic", email_invalid: "email", prefix_invalid: "invoicePrefix",
  capital_invalid: "capital", penalty_invalid: "penaltyRate", terms_invalid: "paymentDays", country_invalid: "country",
};
const forms = ["SARL", "SAS", "SASU", "EURL", "EI", "SA", "SCOP", "SNC", "SCI"];

export function SettingsView({ t, locale, company: c, missing, canEdit, currency, year, sample, logo }: { t: Catalogue; locale: Locale; company: Company; missing: string[]; canEdit: boolean; currency: string; year: number; sample: string; logo: string | null }) {
  const s = t.settings;
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<Fields>({
    legalName: c.legalName, tradeName: c.tradeName, legalForm: c.legalForm, capital: c.capital === null ? "" : inputAmount(c.capital, currency, locale), address: c.address,
    postcode: c.postcode, city: c.city, country: c.country, siren: c.siren, siret: c.siret, rcsCity: c.rcsCity, vatNumber: c.vatNumber, email: c.email, phone: c.phone,
    website: c.website, bank: c.bank, iban: c.iban, bic: c.bic, paymentDays: String(c.paymentDays), validityDays: String(c.validityDays),
    penaltyRate: c.penaltyRate === null ? "" : inputPercent(c.penaltyRate, locale), earlyDiscount: c.earlyDiscount, footer: c.footer, quotePrefix: c.quotePrefix,
    invoicePrefix: c.invoicePrefix, creditPrefix: c.creditPrefix, franchise: c.franchise, vatOnDebits: c.vatOnDebits,
  });
  const [gaps, setGaps] = useState(missing);
  const [error, setError] = useState<{ field: keyof Fields | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Fields>) => setF(v => ({ ...v, ...patch }));
  const bad = (k: keyof Fields) => (error?.field === k ? true : undefined);
  const needed = (k: string) => gaps.includes(k);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await updateCompany({ ...f, paymentDays: f.paymentDays, validityDays: f.validityDays });
    setBusy(false);
    if (!result.ok) {
      setError({ field: fieldOf[result.error] ?? null, text: format(t.errors[result.error], result.values ?? {}) });
      toast(format(t.errors[result.error], result.values ?? {}));
      return;
    }
    setError(null);
    setGaps(result.value.missing);
    toast(result.value.missing.length === 0 ? s.savedComplete : s.saved);
    router.refresh();
  }

  async function upload(chosen: File) {
    setUploading(true);
    try {
      const grant = await fetch("/chest/api/logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: chosen.type, size: chosen.size }) });
      const answer = (await grant.json()) as { url?: string; object?: string; error?: string };
      if (!grant.ok || !answer.url || !answer.object) return toast(t.errors[(answer.error ?? "unknown") as keyof Catalogue["errors"]] ?? t.errors.unknown);
      const put = await fetch(answer.url, { method: "PUT", body: chosen, headers: { "Content-Type": chosen.type } });
      if (!put.ok) return toast(put.status === 413 ? t.errors.logo_too_large : put.status === 415 ? t.errors.logo_type : t.errors.file_missing);
      const saved = await saveLogo(answer.object);
      if (!saved.ok) return toast(t.errors[saved.error]);
      toast(s.logoSaved);
      router.refresh();
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  const text = (k: keyof Fields, label: string, options: { hint?: string; className?: string; max?: number; placeholder?: string; list?: string; inputMode?: "numeric" | "decimal" | "email" | "tel" | "url"; required?: boolean } = {}) => (
    <div className={`field-row ${options.className ?? ""}`}>
      <label htmlFor={`s-${k}`}>{label}{needed(k) && <span className="error"> · {s.needed}</span>}</label>
      <input id={`s-${k}`} className="field" value={f[k] as string} maxLength={options.max ?? 160} readOnly={!canEdit} aria-invalid={bad(k) ?? (needed(k) ? true : undefined)}
        placeholder={options.placeholder} list={options.list} inputMode={options.inputMode} aria-describedby={options.hint ? `s-${k}-hint` : undefined} onChange={e => set({ [k]: e.target.value } as Partial<Fields>)} />
      {options.hint && <span className="hint" id={`s-${k}-hint`}>{options.hint}</span>}
    </div>
  );

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p>{canEdit ? s.intro : s.readOnly}</p>
        </div>
      </div>
      {gaps.length > 0 && (
        <div className="callout" role="note">
          <Alert />
          <div>
            <p><strong>{s.missingTitle}</strong></p>
            <p>{gaps.map(g => s.fields[g as keyof Catalogue["settings"]["fields"]] ?? g).join(" · ")}</p>
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <section className="panel" aria-labelledby="s-company">
          <h2 id="s-company">{s.sections.company}</h2>
          <p className="hint">{s.sections.companyHint}</p>
          <div className="form-grid">
            {text("legalName", s.fields.legalName, { className: "two-thirds" })}
            {text("legalForm", s.fields.legalForm, { className: "third", list: "forms", max: 60, hint: s.hints.legalForm })}
            <datalist id="forms">{forms.map(x => <option key={x} value={x} />)}</datalist>
            {text("tradeName", s.fields.tradeName, { className: "two-thirds", hint: s.hints.tradeName })}
            {text("capital", s.fields.capital, { className: "third", inputMode: "decimal", hint: format(s.hints.capital, { currency }) })}
            <div className="field-row">
              <label htmlFor="s-address">{s.fields.address}{needed("address") && <span className="error"> · {s.needed}</span>}</label>
              <textarea id="s-address" className="field" rows={2} value={f.address} maxLength={300} readOnly={!canEdit} aria-invalid={needed("address") ? true : undefined} onChange={e => set({ address: e.target.value })} />
            </div>
            {text("postcode", s.fields.postcode, { className: "third", max: 12 })}
            {text("city", s.fields.city, { className: "third", max: 80 })}
            {text("country", s.fields.country, { className: "third", max: 2, hint: s.hints.country })}
          </div>
        </section>

        <section className="panel" aria-labelledby="s-legal">
          <h2 id="s-legal">{s.sections.legal}</h2>
          <p className="hint">{s.sections.legalHint}</p>
          <div className="form-grid">
            {text("siren", s.fields.siren, { className: "half", inputMode: "numeric", max: 14, hint: s.hints.siren })}
            {text("siret", s.fields.siret, { className: "half", inputMode: "numeric", max: 20, hint: s.hints.siret })}
            {text("rcsCity", s.fields.rcsCity, { className: "half", max: 80, hint: s.hints.rcsCity })}
            <fieldset className="choice" disabled={!canEdit}>
              <legend>{s.fields.franchise}</legend>
              <label className="option"><input type="radio" name="regime" checked={!f.franchise} onChange={() => set({ franchise: false })} /><span>{s.regime.standard}</span><span className="sub">{s.regime.standardHint}</span></label>
              <label className="option"><input type="radio" name="regime" checked={f.franchise} onChange={() => set({ franchise: true })} /><span>{s.regime.franchise}</span><span className="sub">{s.regime.franchiseHint}</span></label>
            </fieldset>
            {!f.franchise && text("vatNumber", s.fields.vatNumber, { className: "half", max: 20, hint: s.hints.vatNumber })}
            {!f.franchise && (
              <label className="check half">
                <input type="checkbox" checked={f.vatOnDebits} disabled={!canEdit} onChange={e => set({ vatOnDebits: e.target.checked })} />
                <span>{s.fields.vatOnDebits}<br /><span className="hint">{s.hints.vatOnDebits}</span></span>
              </label>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="s-letterhead">
          <h2 id="s-letterhead">{s.sections.letterhead}</h2>
          <p className="hint">{s.sections.letterheadHint}</p>
          <div className="form-grid">
            <div className="field-row">
              <span className="field-label">{s.fields.logo}</span>
              <div className="logo-box">
                <div className="preview">{logo ? <img src={logo} alt={s.logoAlt} /> : s.noLogo}</div>
                {canEdit && (
                  <>
                    <input ref={file} id="s-logo" type="file" accept="image/png,image/jpeg" hidden onChange={e => { const chosen = e.target.files?.[0]; if (chosen) void upload(chosen); }} />
                    <button type="button" className="button quiet small" disabled={uploading} onClick={() => file.current?.click()}><Upload />{uploading ? s.uploading : logo ? s.changeLogo : s.addLogo}</button>
                    {logo && <button type="button" className="button ghost small" onClick={() => void removeLogo().then(r => { if (r.ok) { toast(s.logoRemoved); router.refresh(); } })}><Trash />{s.removeLogo}</button>}
                  </>
                )}
                <span className="hint">{s.hints.logo}</span>
              </div>
            </div>
            {text("email", s.fields.email, { className: "third", inputMode: "email", max: 254, hint: s.hints.email })}
            {text("phone", s.fields.phone, { className: "third", inputMode: "tel", max: 40 })}
            {text("website", s.fields.website, { className: "third", inputMode: "url", max: 120 })}
          </div>
        </section>

        <section className="panel" aria-labelledby="s-payment">
          <h2 id="s-payment">{s.sections.payment}</h2>
          <p className="hint">{s.sections.paymentHint}</p>
          <div className="form-grid">
            {text("bank", s.fields.bank, { className: "third" })}
            {text("iban", s.fields.iban, { className: "two-thirds", max: 42 })}
            {text("bic", s.fields.bic, { className: "third", max: 11 })}
            {text("paymentDays", s.fields.paymentDays, { className: "third", inputMode: "numeric", max: 3, hint: s.hints.paymentDays })}
            {text("penaltyRate", s.fields.penaltyRate, { className: "third", inputMode: "decimal", max: 6, placeholder: s.hints.penaltyPlaceholder, hint: s.hints.penaltyRate })}
            {text("earlyDiscount", s.fields.earlyDiscount, { max: 500, placeholder: s.hints.earlyPlaceholder, hint: s.hints.earlyDiscount })}
          </div>
        </section>

        <section className="panel" aria-labelledby="s-documents">
          <h2 id="s-documents">{s.sections.documents}</h2>
          <p className="hint">{s.sections.documentsHint}</p>
          <div className="form-grid">
            {text("validityDays", s.fields.validityDays, { className: "third", inputMode: "numeric", max: 3 })}
            {text("quotePrefix", s.fields.quotePrefix, { className: "third", max: 8, hint: sample.replace("X", f.quotePrefix || "?") })}
            {text("invoicePrefix", s.fields.invoicePrefix, { className: "third", max: 8, hint: sample.replace("X", f.invoicePrefix || "?") })}
            {text("creditPrefix", s.fields.creditPrefix, { className: "third", max: 8, hint: sample.replace("X", f.creditPrefix || "?") })}
            <p className="hint two-thirds">{format(s.hints.numbering, { year })}</p>
            <div className="field-row">
              <label htmlFor="s-footer">{s.fields.footer}</label>
              <textarea id="s-footer" className="field" rows={2} value={f.footer} maxLength={500} readOnly={!canEdit} placeholder={s.hints.footerPlaceholder} aria-describedby="s-footer-hint" onChange={e => set({ footer: e.target.value })} />
              <span className="hint" id="s-footer-hint">{s.hints.footer}</span>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="s-law">
          <h2 id="s-law">{s.law.title}</h2>
          <div className="notice">
            <p><Info /> {s.law.reform}</p>
            <p>{s.law.notPa}</p>
            <p>{s.law.keep}</p>
          </div>
        </section>

        {error && <p className="error" role="alert">{error.text}</p>}
        {canEdit && (
          <div className="sticky-save">
            <button type="submit" className="button" disabled={busy}>{busy ? s.saving : s.save}</button>
          </div>
        )}
      </form>
    </main>
  );
}
