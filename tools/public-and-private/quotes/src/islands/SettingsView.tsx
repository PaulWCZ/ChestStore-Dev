import { call, refresh, toast } from "@argentic/chest-app/client";
import { FilePicker, PageHeader, type PickedFile, type Upload } from "@argentic/chest-ui/components";
import { putWithProgress } from "@argentic/chest-ui/components/logic";
import { useEffect, useState } from "react";
import { Alert, Info, Trash } from "../components/icons.tsx";
import { format } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Accounts, Company } from "../lib/company.ts";
import type { MailState } from "../lib/mailing.ts";
import { limits } from "../shared/model.ts";
import { inputAmount, inputPercent } from "../shared/money.ts";

export type SettingsWords = Pick<Catalogue, "settings" | "errors" | "kit">;

type Fields = Record<"legalName" | "tradeName" | "legalForm" | "capital" | "address" | "postcode" | "city" | "country" | "siren" | "siret" | "rcsCity" | "vatNumber" | "email" | "phone" | "website" | "bank" | "iban" | "bic" | "paymentDays" | "validityDays" | "penaltyRate" | "earlyDiscount" | "footer" | "quotePrefix" | "invoicePrefix" | "creditPrefix" | "paymentLink" | "reminderDays", string>
  & { franchise: boolean; vatOnDebits: boolean; remindersOn: boolean; remindersEmail: boolean; accounts: Accounts };

const fieldOf: Record<string, keyof Fields> = {
  siren_invalid: "siren", siret_invalid: "siret", vat_number_invalid: "vatNumber", iban_invalid: "iban", bic_invalid: "bic", email_invalid: "email", prefix_invalid: "invoicePrefix",
  capital_invalid: "capital", penalty_invalid: "penaltyRate", terms_invalid: "paymentDays", country_invalid: "country", link_invalid: "paymentLink", reminder_days_invalid: "reminderDays",
  account_invalid: "accounts",
};
const forms = ["SARL", "SAS", "SASU", "EURL", "EI", "SA", "SCOP", "SNC", "SCI"];

export function SettingsView({ t, locale, company: c, missing, canEdit, currency, sample, logo, terms, rates, mailReason, replyTo }: { mailReason: MailState["reason"]; replyTo: string | null; t: SettingsWords; locale: Locale; company: Company; missing: readonly string[]; canEdit: boolean; currency: string; sample: string; logo: string | null; terms: { name: string; size: string } | null; rates: readonly { rate: string; text: string }[] }) {
  const s = t.settings;
  const r = s.reminderRules;
  const [f, setF] = useState<Fields>({
    legalName: c.legalName, tradeName: c.tradeName, legalForm: c.legalForm, capital: c.capital === null ? "" : inputAmount(c.capital, currency, locale), address: c.address,
    postcode: c.postcode, city: c.city, country: c.country, siren: c.siren, siret: c.siret, rcsCity: c.rcsCity, vatNumber: c.vatNumber, email: c.email, phone: c.phone,
    website: c.website, bank: c.bank, iban: c.iban, bic: c.bic, paymentDays: String(c.paymentDays), validityDays: String(c.validityDays),
    penaltyRate: c.penaltyRate === null ? "" : inputPercent(c.penaltyRate, locale), earlyDiscount: c.earlyDiscount, footer: c.footer, quotePrefix: c.quotePrefix,
    invoicePrefix: c.invoicePrefix, creditPrefix: c.creditPrefix, franchise: c.franchise, vatOnDebits: c.vatOnDebits,
    paymentLink: c.paymentLink ?? "", remindersOn: c.reminders.on, reminderDays: c.reminders.days.join(", "), remindersEmail: c.reminders.email, accounts: c.accounts,
  });
  const [gaps, setGaps] = useState<readonly string[]>(missing);
  const [error, setError] = useState<{ field: keyof Fields | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoFiles, setLogoFiles] = useState<readonly PickedFile[]>([]);
  const [termsFiles, setTermsFiles] = useState<readonly PickedFile[]>([]);
  const set = (patch: Partial<Fields>) => setF(v => ({ ...v, ...patch }));
  const bad = (k: keyof Fields) => (error?.field === k ? true : undefined);
  // The VAT number is not needed under the exemption, even before saving.
  const needed = (k: string) => gaps.includes(k) && !(k === "vatNumber" && f.franchise);
  const shownGaps = gaps.filter(needed);
  const setAccount = (key: keyof Omit<Accounts, "vat">, value: string) => set({ accounts: { ...f.accounts, [key]: value.toUpperCase() } });
  const setVatAccount = (rate: string, value: string) => set({ accounts: { ...f.accounts, vat: { ...f.accounts.vat, [rate]: value.toUpperCase() } } });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await call("updateCompany", { ...f });
    setBusy(false);
    if (!result.ok) {
      setError({ field: fieldOf[result.error] ?? null, text: result.message });
      return;
    }
    setError(null);
    setGaps(result.value.missing);
    toast({ id: "settings", text: result.value.missing.length === 0 ? s.savedComplete : s.saved });
  }

  // A file goes from this browser to the Chest's files: the tool grants
  // one upload (its address), the browser sends it there, then the tool
  // checks what arrived and keeps it.
  const sender = (grant: "grantLogo" | "grantTerms", save: (object: string, name: string) => Promise<{ ok: true } | { ok: false; message: string }>, refused: { tooLarge: string; type: string }): Upload => async (chosen, { onProgress, signal }) => {
    const granted = await call(grant, { type: chosen.type, size: chosen.size }, { quiet: true, refresh: false });
    if (!granted.ok) return { ok: false, error: granted.message };
    const put = await putWithProgress(granted.value.url, chosen, { headers: { "Content-Type": chosen.type }, onProgress, signal });
    if (put.status >= 300) return { ok: false, error: put.status === 413 ? refused.tooLarge : put.status === 415 || put.status === 400 ? refused.type : t.errors.file_missing };
    const saved = await save(granted.value.object, chosen.name);
    return saved.ok ? { ok: true, ref: granted.value.object } : { ok: false, error: saved.message };
  };
  const upload = sender("grantLogo", object => call("saveLogo", { object }, { quiet: true, refresh: false }), { tooLarge: t.errors.logo_too_large, type: t.errors.logo_type });
  const uploadTerms = sender("grantTerms", (object, name) => call("saveTerms", { object, name }, { quiet: true, refresh: false }), { tooLarge: t.errors.terms_too_large, type: t.errors.terms_type });
  // Once kept, it shows in the page: the picker is empty again.
  useEffect(() => {
    if (!logoFiles.some(x => x.status === "ready")) return;
    setLogoFiles([]);
    toast({ id: "logo", text: s.logoSaved });
    void refresh();
  }, [logoFiles, s.logoSaved]);
  useEffect(() => {
    if (!termsFiles.some(x => x.status === "ready")) return;
    setTermsFiles([]);
    toast({ id: "terms", text: s.termsSaved });
    void refresh();
  }, [termsFiles, s.termsSaved]);

  const text = (k: keyof Fields, label: string, options: { hint?: string; className?: string; max?: number; placeholder?: string; list?: string; inputMode?: "numeric" | "decimal" | "email" | "tel" | "url"; required?: boolean } = {}) => (
    <div className={`field-row ${options.className ?? ""}`}>
      <label htmlFor={`s-${k}`}>{label}{needed(k) && <span className="error"> · {s.needed}</span>}</label>
      <input id={`s-${k}`} className="field" value={f[k] as string} maxLength={options.max ?? 160} readOnly={!canEdit} aria-invalid={bad(k) ?? (needed(k) ? true : undefined)}
        placeholder={options.placeholder} list={options.list} inputMode={options.inputMode} aria-describedby={options.hint ? `s-${k}-hint` : undefined} onChange={e => set({ [k]: e.target.value } as Partial<Fields>)} />
      {options.hint && <span className="hint" id={`s-${k}-hint`}>{options.hint}</span>}
    </div>
  );

  return (
    <>
      <PageHeader size="m" title={s.title} intro={canEdit ? s.intro : s.readOnly} />
      {shownGaps.length > 0 && (
        <div className="callout" role="note">
          <Alert />
          <div>
            <p><strong>{s.missingTitle}</strong></p>
            <p>{shownGaps.map(g => s.fields[g as keyof Catalogue["settings"]["fields"]] ?? g).join(" · ")}</p>
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
                <div className="logo-actions">
                  {canEdit && (
                    <>
                      <FilePicker label={s.fields.logo} files={logoFiles} onChange={update => setLogoFiles(update)} upload={upload} maxFiles={1} maxSize={limits.logoSize}
                        accept={["image/png", "image/jpeg"]} labels={{ ...t.kit.files, addOne: logo ? s.changeLogo : s.addLogo }} />
                      {logo && <button type="button" className="button ghost small" onClick={() => void call("removeLogo", {}).then(r => { if (r.ok) toast({ id: "logo", text: s.logoRemoved }); })}><Trash />{s.removeLogo}</button>}
                    </>
                  )}
                  <span className="hint">{s.hints.logo}</span>
                </div>
              </div>
            </div>
            <div className="field-row terms-row">
              <span className="field-label">{s.termsLabel}</span>
              <div className="logo-actions">
                <p className="terms-file">{terms ? <a href="/chest/terms"><span>{terms.name}</span> <span className="hint">{terms.size}</span></a> : <span className="muted">{s.termsNone}</span>}</p>
                {canEdit && (
                  <>
                    <FilePicker label={s.termsLabel} files={termsFiles} onChange={update => setTermsFiles(update)} upload={uploadTerms} maxFiles={1} maxSize={limits.termsSize}
                      accept={["application/pdf"]} labels={{ ...t.kit.files, addOne: terms ? s.changeTerms : s.addTerms }} />
                    {terms && <button type="button" className="button ghost small" onClick={() => void call("removeTerms", {}).then(r => { if (r.ok) toast({ id: "terms", text: s.termsRemoved }); })}><Trash />{s.removeLogo}</button>}
                  </>
                )}
                <span className="hint">{s.termsHint}</span>
              </div>
            </div>
            {text("email", s.fields.email, { className: "third", inputMode: "email", max: 254, hint: f.email.trim() === "" && replyTo ? format(s.hints.emailEmpty, { address: replyTo }) : s.hints.email })}
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
            {text("paymentLink", s.fields.paymentLink, { max: 300, inputMode: "url", placeholder: s.hints.paymentLinkPlaceholder, hint: s.hints.paymentLink })}
          </div>
        </section>

        <section className="panel" aria-labelledby="s-reminders">
          <h2 id="s-reminders">{s.sections.reminders}</h2>
          <p className="hint">{s.sections.remindersHint}</p>
          <div className="form-grid">
            <label className="check">
              <input type="checkbox" checked={f.remindersOn} disabled={!canEdit} onChange={e => set({ remindersOn: e.target.checked })} />
              <span>{r.on}<br /><span className="hint">{f.remindersOn ? r.onHint : r.off}</span></span>
            </label>
            {f.remindersOn && (
              <>
                {text("reminderDays", r.days, { className: "half", max: 40, inputMode: "numeric", hint: r.daysHint })}
                <fieldset className="choice" disabled={!canEdit}>
                  <legend>{r.how}</legend>
                  <div className="two-col">
                    <label className="option"><input type="radio" name="reminder-how" checked={f.remindersEmail} onChange={() => set({ remindersEmail: true })} /><span>{r.email}</span><span className="sub">{r.emailHint}</span></label>
                    <label className="option"><input type="radio" name="reminder-how" checked={!f.remindersEmail} onChange={() => set({ remindersEmail: false })} /><span>{r.bell}</span><span className="sub">{r.bellHint}</span></label>
                  </div>
                </fieldset>
                {f.remindersEmail && mailReason && (
                  <div className="callout quiet" role="note">
                    <Info />
                    <p>{r.noMail[mailReason]}</p>
                  </div>
                )}
              </>
            )}
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
            <div className="field-row">
              <label htmlFor="s-footer">{s.fields.footer}</label>
              <textarea id="s-footer" className="field" rows={2} value={f.footer} maxLength={500} readOnly={!canEdit} placeholder={s.hints.footerPlaceholder} aria-describedby="s-footer-hint" onChange={e => set({ footer: e.target.value })} />
              <span className="hint" id="s-footer-hint">{s.hints.footer}</span>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="s-accounts">
          <h2 id="s-accounts">{s.sections.accounts}</h2>
          <p className="hint">{s.sections.accountsHint}</p>
          <div className="form-grid accounts">
            {([["journal", s.fields.accountJournal], ["client", s.fields.accountClient], ["services", s.fields.accountServices], ["goods", s.fields.accountGoods], ["deposits", s.fields.accountDeposits]] as const).map(([key, label]) => (
              <div key={key} className="field-row third">
                <label htmlFor={`a-${key}`}>{label}</label>
                <input id={`a-${key}`} className="field num" value={f.accounts[key]} maxLength={20} readOnly={!canEdit} aria-invalid={error?.field === "accounts" ? true : undefined} onChange={e => setAccount(key, e.target.value)} />
              </div>
            ))}
            {rates.map(x => (
              <div key={x.rate} className="field-row third">
                <label htmlFor={`a-vat-${x.rate}`}>{format(s.fields.accountVat, { rate: x.text })}</label>
                <input id={`a-vat-${x.rate}`} className="field num" value={f.accounts.vat[x.rate] ?? ""} maxLength={20} readOnly={!canEdit} onChange={e => setVatAccount(x.rate, e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        {error && <p className="error" role="alert">{error.text}</p>}
        {canEdit && (
          <div className="sticky-save">
            <button type="submit" className="button" disabled={busy}>{busy ? s.saving : s.save}</button>
          </div>
        )}
      </form>
    </>
  );
}
