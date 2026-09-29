"use client";

import { Avatar, FilePicker, StatusBadge, Switch, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BankForm, type BankCurrent } from "../../../components/bank-form.tsx";
import { Stamp } from "../../../components/bits.tsx";
import { Car, Wallet } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, intl, plural } from "../../../lib/i18n/format.ts";
import type { Result } from "../../../lib/errors.ts";
import type { Scale, VehicleKind } from "../../../lib/scale.ts";
import { upload } from "../../../components/upload.ts";
import { limits, receiptTypes } from "../../../lib/model.ts";
import { ImportSection } from "./import-view.tsx";
import { addCategory, checkVehicle, saveAllowanceRate, saveScale, setApprover, setMemberAccount, setPriorDistance, setRate, setVehicle, setVehicleProof, updateCategory, updateCompany } from "../actions.ts";

type Option = { value: string; label: string };
type Words = Catalogue["settings"] & { files: Catalogue["files"]; table: Catalogue["table"] };
type Errors = Catalogue["errors"];
type CategoryRow = { id: string; name: string; placeholder: string; account: string; vatRecovery: string; cap: string; mileage: boolean; archived: boolean; guests: boolean; perNight: boolean; allowance: boolean };
type Company = {
  team: { id: string; name: string }[];
  payer: string;
  journal: { code: string; employees: string; vat: string; card: string };
  vehicles: { member: string; name: string; label: string; proof: string | null; checked: boolean }[];
  allowances: { id: string; name: string; placeholder: string; amount: string; unit: string; account: string; archived: boolean }[];
  units: Option[];
  rates: { currency: string; rate: string }[];
  bank: BankCurrent;
  sealed: boolean;
  currency: string;
  currencies: string[];
  reminder: boolean;
  categories: CategoryRow[];
  people: { id: string; name: string; photo: string | null; role: string; approver: string; account: string }[];
  approvers: { id: string; name: string }[];
  scales: { year: number; data: Scale; source: string }[];
  year: number;
  fallback: string | null;
  kinds: { value: VehicleKind; label: string; powers: Record<string, string> }[];
};

function useRun(errors: Errors) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(step: () => Promise<Result<T>>, done?: (value: T) => string | void) => start(async () => {
    const result = await step();
    if (!result.ok) {
      toast({ text: format(errors[result.error], result.values ?? {}), tone: "error" });
      return;
    }
    const message = done?.(result.value);
    if (message) toast({ id: "settings", text: message });
    router.refresh();
  });
  return { run, pending };
}

export type { Company };
export type VehicleData = {
  kinds: Option[];
  powers: Record<string, Option[]>;
  current: { kind: string; power: string; electric: boolean } | null;
  electric: string;
  prior: { year: number; value: string };
  proof: { name: string; href: string; checked: boolean } | null;
};

// Settings → Me: what each person sets for themselves.
export function MyView({ vehicle, bank, t, errors, cancel }: { vehicle: VehicleData; bank: BankCurrent; t: Words; errors: Errors; cancel: string }) {
  return (
    <div className="settings">
      <VehicleForm vehicle={vehicle} t={t} errors={errors} />
      <section id="bank" className="paper" aria-labelledby="bank-title">
        <h2 id="bank-title" className="section-title"><Wallet />{t.bank.title}</h2>
        <p className="hint">{t.bank.intro}</p>
        <hr className="rule" />
        <BankForm owner="me" current={bank} t={t.bank} errors={errors} save={t.bank.save} cancel={cancel} />
      </section>
    </div>
  );
}

// Settings → Company: the accountant's.
export function CompanyView({ locale, company, t, errors, cancel }: { locale: string; company: Company; t: Words; errors: Errors; cancel: string }) {
  return (
    <div className="settings">
      <nav className="toc" aria-label={t.sections}>
        {([["bank", t.bank.companyTitle], ["categories", t.categories.title], ["approvers", t.approvers.title], ["allowances", t.allowances.title], ["rates", t.rates.title], ["journal", t.journal.title], ["vehicles", t.vehicles.title], ["scale", t.scale.title], ["import", t.import.title]] as const).map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
      <CompanyForm company={company} t={t} errors={errors} />
      <CompanyBank company={company} t={t} errors={errors} cancel={cancel} />
      <Categories company={company} t={t} errors={errors} />
      <Approvers company={company} t={t} errors={errors} />
      <Allowances company={company} t={t} errors={errors} />
      <Rates company={company} locale={locale} t={t} errors={errors} />
      <JournalAccounts company={company} t={t} errors={errors} />
      <Vehicles company={company} t={t} errors={errors} />
      <ScaleEditor company={company} locale={locale} t={t} errors={errors} />
      <ImportSection team={company.team} locale={locale} t={t.import} kit={{ files: t.files, table: t.table }} errors={errors} />
    </div>
  );
}

function VehicleForm({ vehicle, t, errors }: { vehicle: VehicleData; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [kind, setKind] = useState(vehicle.current?.kind ?? "car");
  const powers = vehicle.powers[kind] ?? [];
  const [power, setPower] = useState(vehicle.current?.power ?? powers[2]?.value ?? powers[0]?.value ?? "");
  const [electric, setElectric] = useState(vehicle.current?.electric ?? false);
  return (
    <section id="vehicle" className="paper" aria-labelledby="vehicle-title">
      <h2 id="vehicle-title" className="section-title"><Car />{t.vehicle.title}</h2>
      <p className="hint">{t.vehicle.intro}</p>
      <hr className="rule" />
      <form className="form-grid" onSubmit={e => { e.preventDefault(); run(() => setVehicle({ kind, power, electric }), () => t.vehicle.saved); }}>
        <div className="two stack">
          <div className="field-row">
            <label htmlFor="vehicle-kind">{t.vehicle.kind}</label>
            <select id="vehicle-kind" className="field" value={kind} onChange={e => { setKind(e.target.value); setPower(vehicle.powers[e.target.value]?.[0]?.value ?? ""); }}>
              {vehicle.kinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="vehicle-power">{t.vehicle.power}</label>
            <select id="vehicle-power" className="field" value={power} onChange={e => setPower(e.target.value)} aria-describedby="power-hint">
              {powers.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <span id="power-hint" className="hint">{t.vehicle.powerHint}</span>
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={electric} onChange={e => setElectric(e.target.checked)} />{vehicle.electric}</label>
        <div><button type="submit" className="button" disabled={pending}>{t.vehicle.save}</button></div>
      </form>
      {vehicle.current && (
        <>
          <hr className="rule" />
          <PriorForm prior={vehicle.prior} t={t} errors={errors} />
          <hr className="rule" />
          <ProofField proof={vehicle.proof} t={t} errors={errors} />
        </>
      )}
    </section>
  );
}

// The kilometres driven this year before the tool (moving here mid-year).
function PriorForm({ prior, t, errors }: { prior: VehicleData["prior"]; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [value, setValue] = useState(prior.value);
  return (
    <form className="pay-form" onSubmit={e => { e.preventDefault(); run(() => setPriorDistance(prior.year, value), () => format(t.vehicle.priorSaved, { year: prior.year })); }}>
      <div className="field-row grow-row">
        <label htmlFor="prior">{format(t.vehicle.prior, { year: prior.year })}</label>
        <input id="prior" className="field mono" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="0" aria-describedby="prior-hint" />
        <span id="prior-hint" className="hint">{t.vehicle.priorHint}</span>
      </div>
      <button type="submit" className="button quiet" disabled={pending || value === prior.value}>{t.vehicle.priorSave}</button>
    </form>
  );
}

// The registration certificate: a photo or a PDF, straight to the Chest
// (the kit's FilePicker, a thumbnail of the photo while it goes; not its
// `camera` yet: on a computer its hidden camera input has no label — the
// kit's 0.2.2 hides the label but not the input). Once it
// arrived, it is kept as the vehicle's certificate.
function ProofField({ proof, t, errors }: { proof: VehicleData["proof"]; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  // Arrived: kept on the vehicle, and the list is empty again.
  const arrived = files.find(f => f.status === "ready" && f.ref);
  useEffect(() => {
    if (!arrived) return;
    setFiles(list => list.filter(f => f.key !== arrived.key));
    run(() => setVehicleProof(arrived.ref!, arrived.name), () => t.vehicle.proofSaved);
  }, [arrived, run, t.vehicle.proofSaved]);
  return (
    <div className="field-row">
      <span className="field-label">{t.vehicle.proof}</span>
      <span className="hint">{t.vehicle.proofHint}</span>
      {proof && (
        <div className="proof-line">
          <a className="mono" href={proof.href} target="_blank" rel="noopener">{proof.name}</a>
          <StatusBadge tone={proof.checked ? "ok" : "wait"} label={proof.checked ? t.vehicle.proofChecked : t.vehicle.proofUnchecked} size="s" />
          <button type="button" className="link-button danger" disabled={pending} onClick={() => run(() => setVehicleProof(null), () => t.vehicle.proofRemoved)}>{t.vehicle.proofRemove}</button>
        </div>
      )}
      <FilePicker
        label={proof ? t.vehicle.proofReplace : t.vehicle.proofAdd}
        files={files}
        onChange={setFiles}
        maxFiles={1}
        maxSize={limits.receiptSize}
        accept={[...receiptTypes, ".heic", ".heif", ".pdf"]}
        disabled={pending}
        labels={t.files}
        preview={f => (f.file && viewable(f.file) ? <Thumb file={f.file} /> : null)}
        upload={async (file, { onProgress, signal }) => {
          const sent = await upload(file, { onProgress, signal });
          return sent.ok ? { ok: true, ref: sent.object } : { ok: false, error: format(errors[sent.error], sent.values ?? {}) };
        }}
      />
    </div>
  );
}

// A photo's thumbnail before its name while it is sent (the policy allows
// blob: images); a PDF keeps the kit's file sign.
const viewable = (file: File) => file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif";
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url ? <img src={url} alt="" /> : null;
}

function CompanyForm({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  // The month-end reminder takes effect at once: a switch, its value shown
  // at once and put back if the server refuses.
  const [reminder, setReminder] = useState(company.reminder);
  return (
    <section className="paper" aria-labelledby="company-title">
      <h2 id="company-title">{t.company.title}</h2>
      <hr className="rule" />
      <div className="form-grid">
        <div className="field-row narrow">
          <label htmlFor="currency">{t.company.currency}</label>
          <select id="currency" className="field" defaultValue={company.currency} disabled={pending} onChange={e => run(() => updateCompany({ currency: e.target.value }), () => t.company.saved)}>
            {company.currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Switch label={t.company.reminder} checked={reminder} disabled={pending} onChange={on => {
          setReminder(on);
          run(async () => {
            const result = await updateCompany({ reminder: on });
            if (!result.ok) setReminder(!on);
            return result;
          }, () => t.company.saved);
        }} />
      </div>
    </section>
  );
}

function CompanyBank({ company, t, errors, cancel }: { company: Company; t: Words; errors: Errors; cancel: string }) {
  const { run, pending } = useRun(errors);
  const [payer, setPayer] = useState(company.payer);
  return (
    <section id="bank" className="paper" aria-labelledby="company-bank-title">
      <h2 id="company-bank-title">{t.bank.companyTitle}</h2>
      <p className="hint">{t.bank.companyIntro}</p>
      <hr className="rule" />
      <div className="form-grid">
        <form className="pay-form" onSubmit={e => { e.preventDefault(); run(() => updateCompany({ payer }), () => t.company.saved); }}>
          <div className="field-row grow-row">
            <label htmlFor="payer">{t.bank.payer}</label>
            <input id="payer" className="field" value={payer} onChange={e => setPayer(e.target.value)} maxLength={70} autoComplete="organization" />
          </div>
          <button type="submit" className="button quiet" disabled={pending || payer.trim() === company.payer}>{t.categories.save}</button>
        </form>
        <BankForm owner="company" current={company.bank} t={t.bank} errors={errors} save={t.bank.companySave} cancel={cancel} holder={false} idPrefix="company-bank" />
        {!company.sealed && <p className="hint">{t.bank.notSealed}</p>}
      </div>
    </section>
  );
}

function Categories({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [name, setName] = useState("");
  const save = (id: string, field: "name" | "account" | "vatRecovery" | "cap", value: string, before: string) => {
    if (value === before) return;
    run(() => updateCategory(id, { [field]: field === "vatRecovery" ? Number(value) : field === "cap" ? (value.trim() === "" ? null : value) : value }), () => t.company.saved);
  };
  return (
    <section id="categories" className="paper" aria-labelledby="categories-title">
      <h2 id="categories-title">{t.categories.title}</h2>
      <p className="hint">{t.categories.intro}</p>
      <hr className="rule" />
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>{t.categories.name}</th><th>{t.categories.account}</th><th>{t.categories.vatRecovery}</th><th title={t.categories.capHint}>{t.categories.cap}</th><th>{t.categories.guests}</th><th>{t.categories.perNight}</th><th><span className="visually-hidden">{t.categories.hide}</span></th></tr>
          </thead>
          <tbody>
            {company.categories.map(c => (
              <tr key={c.id} className={c.archived ? "hidden" : undefined}>
                <td>
                  <label className="visually-hidden" htmlFor={`cat-name-${c.id}`}>{t.categories.name}</label>
                  <input id={`cat-name-${c.id}`} className="field" defaultValue={c.name} placeholder={c.placeholder} maxLength={60} onBlur={e => save(c.id, "name", e.target.value.trim(), c.name)} />
                  {c.mileage && <span className="hint">{t.categories.mileage}</span>}
                  {c.allowance && <span className="hint">{t.categories.allowance}</span>}
                </td>
                <td><label className="visually-hidden" htmlFor={`cat-account-${c.id}`}>{t.categories.account}</label><input id={`cat-account-${c.id}`} className="field num mono" defaultValue={c.account} maxLength={20} onBlur={e => save(c.id, "account", e.target.value.trim(), c.account)} /></td>
                <td><label className="visually-hidden" htmlFor={`cat-vat-${c.id}`}>{t.categories.vatRecovery}</label><input id={`cat-vat-${c.id}`} className="field num short" inputMode="numeric" defaultValue={c.vatRecovery} onBlur={e => save(c.id, "vatRecovery", e.target.value.trim(), c.vatRecovery)} /></td>
                <td>{!c.mileage && !c.allowance && <><label className="visually-hidden" htmlFor={`cat-cap-${c.id}`}>{t.categories.cap}</label><input id={`cat-cap-${c.id}`} className="field num" inputMode="decimal" defaultValue={c.cap} placeholder="—" onBlur={e => save(c.id, "cap", e.target.value.trim(), c.cap)} /></>}</td>
                <td>{!c.mileage && !c.allowance && <input type="checkbox" className="pick" aria-label={`${t.categories.guests}: ${c.name || c.placeholder}`} defaultChecked={c.guests} disabled={pending} onChange={e => run(() => updateCategory(c.id, { guests: e.target.checked }), () => t.company.saved)} />}</td>
                <td>{!c.mileage && !c.allowance && <input type="checkbox" className="pick" aria-label={`${t.categories.perNight}: ${c.name || c.placeholder}`} defaultChecked={c.perNight} disabled={pending} onChange={e => run(() => updateCategory(c.id, { perNight: e.target.checked }), () => t.company.saved)} />}</td>
                <td>{!c.mileage && !c.allowance && <button type="button" className="link-button" disabled={pending} onClick={() => run(() => updateCategory(c.id, { archived: !c.archived }))}>{c.archived ? t.categories.show : t.categories.hide}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="pay-form add-row" onSubmit={e => { e.preventDefault(); if (name.trim()) run(() => addCategory({ name }), () => { setName(""); return t.company.saved; }); }}>
        <div className="field-row grow-row">
          <label htmlFor="new-category">{t.categories.newName}</label>
          <input id="new-category" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={60} />
        </div>
        <button type="submit" className="button quiet" disabled={pending || !name.trim()}>{t.categories.add}</button>
      </form>
    </section>
  );
}

function Approvers({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  return (
    <section id="approvers" className="paper" aria-labelledby="approvers-title">
      <h2 id="approvers-title">{t.approvers.title}</h2>
      <p className="hint">{t.approvers.intro} {t.approvers.accountHint}</p>
      <hr className="rule" />
      {company.people.length === 0 ? <p className="hint">{t.approvers.none}</p> : (
        <ul className="people-list">
          {company.people.map(p => (
            <li key={p.id}>
              <Avatar name={p.name} photo={p.photo} />
              <span><strong>{p.name}</strong><br /><span className="hint">{p.role}</span></span>
              <input className="field num mono" aria-label={`${t.approvers.accountCode}: ${p.name}`} title={t.approvers.accountHint} placeholder={company.journal.employees} defaultValue={p.account} maxLength={20}
                onBlur={e => { if (e.target.value.trim() !== p.account) run(() => setMemberAccount(p.id, e.target.value.trim()), () => t.company.saved); }} />
              <select className="field" aria-label={`${t.approvers.approver}: ${p.name}`} defaultValue={p.approver} disabled={pending} onChange={e => run(() => setApprover(p.id, e.target.value || null), v => format(t.approvers.saved, { name: v.name }))}>
                <option value="">{t.approvers.accountants}</option>
                {company.approvers.filter(a => a.id !== p.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Flat rates: name, amount, per what, account; hidden ones stay on the
// expenses that used them.
function Allowances({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState(company.units[0]?.value ?? "day");
  const save = (id: string, field: "name" | "amount" | "account", value: string, before: string) => {
    if (value !== before) run(() => saveAllowanceRate(id, { [field]: value }), () => t.company.saved);
  };
  return (
    <section id="allowances" className="paper" aria-labelledby="allowances-title">
      <h2 id="allowances-title">{t.allowances.title}</h2>
      <p className="hint">{t.allowances.intro}</p>
      <hr className="rule" />
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>{t.allowances.name}</th><th>{t.allowances.amount}</th><th>{t.allowances.unit}</th><th>{t.allowances.account}</th><th><span className="visually-hidden">{t.allowances.hide}</span></th></tr></thead>
          <tbody>
            {company.allowances.map(a => (
              <tr key={a.id} className={a.archived ? "hidden" : undefined}>
                <td><input className="field" aria-label={t.allowances.name} defaultValue={a.name} placeholder={a.placeholder} maxLength={80} onBlur={e => save(a.id, "name", e.target.value.trim(), a.name)} /></td>
                <td><input className="field num mono" inputMode="decimal" aria-label={`${t.allowances.amount}: ${a.name || a.placeholder}`} defaultValue={a.amount} onBlur={e => save(a.id, "amount", e.target.value.trim(), a.amount)} /></td>
                <td>
                  <select className="field" aria-label={`${t.allowances.unit}: ${a.name || a.placeholder}`} defaultValue={a.unit} disabled={pending} onChange={e => run(() => saveAllowanceRate(a.id, { unit: e.target.value }), () => t.company.saved)}>
                    {company.units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </td>
                <td><input className="field num mono" aria-label={`${t.allowances.account}: ${a.name || a.placeholder}`} defaultValue={a.account} maxLength={20} onBlur={e => save(a.id, "account", e.target.value.trim(), a.account)} /></td>
                <td><button type="button" className="link-button" disabled={pending} onClick={() => run(() => saveAllowanceRate(a.id, { archived: !a.archived }))}>{a.archived ? t.allowances.show : t.allowances.hide}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="pay-form add-row" onSubmit={e => { e.preventDefault(); if (name.trim() && amount.trim()) run(() => saveAllowanceRate(null, { name, amount, unit }), () => { setName(""); setAmount(""); return t.company.saved; }); }}>
        <div className="field-row grow-row">
          <label htmlFor="new-allowance">{t.allowances.newName}</label>
          <input id="new-allowance" className="field" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="field-row w-s">
          <label htmlFor="new-allowance-amount">{t.allowances.amount}</label>
          <input id="new-allowance-amount" className="field mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="field-row w-m">
          <label htmlFor="new-allowance-unit">{t.allowances.unit}</label>
          <select id="new-allowance-unit" className="field" value={unit} onChange={e => setUnit(e.target.value)}>
            {company.units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <button type="submit" className="button quiet" disabled={pending || !name.trim() || !amount.trim()}>{t.allowances.add}</button>
      </form>
    </section>
  );
}

// The company's exchange rates: one line per currency, "" takes it off.
function Rates({ company, locale, t, errors }: { company: Company; locale: string; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const others = company.currencies.filter(c => c !== company.currency && !company.rates.some(r => r.currency === c));
  const [currency, setCurrency] = useState(others[0] ?? "");
  const [rate, setRateText] = useState("");
  const saved = (count: number) => plural(t.rates.saved, count, locale);
  return (
    <section id="rates" className="paper" aria-labelledby="rates-title">
      <h2 id="rates-title">{t.rates.title}</h2>
      <p className="hint">{t.rates.intro}</p>
      <hr className="rule" />
      {company.rates.length === 0 ? <p className="hint">{t.rates.none}</p> : (
        <ul className="rate-list">
          {company.rates.map(r => (
            <li key={r.currency}>
              <label htmlFor={`rate-${r.currency}`}>{format(t.rates.rate, { currency: r.currency, company: company.currency })}</label>
              <input id={`rate-${r.currency}`} className="field num mono" inputMode="decimal" defaultValue={r.rate} onBlur={e => { if (e.target.value.trim() !== r.rate) run(() => setRate(r.currency, e.target.value.trim()), v => saved(v.count)); }} />
              <button type="button" className="link-button danger" disabled={pending} onClick={() => run(() => setRate(r.currency, ""), v => saved(v.count))}>{t.rates.remove}<span className="visually-hidden"> {r.currency}</span></button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <form className="pay-form add-row" onSubmit={e => { e.preventDefault(); if (currency && rate.trim()) run(() => setRate(currency, rate.trim()), v => { setRateText(""); return saved(v.count); }); }}>
          <div className="field-row w-m">
            <label htmlFor="new-rate-currency">{t.rates.currency}</label>
            <select id="new-rate-currency" className="field" value={currency} onChange={e => setCurrency(e.target.value)}>
              {others.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-row w-l">
            <label htmlFor="new-rate">{format(t.rates.rate, { currency, company: company.currency })}</label>
            <input id="new-rate" className="field mono" inputMode="decimal" value={rate} onChange={e => setRateText(e.target.value)} />
          </div>
          <button type="submit" className="button quiet" disabled={pending || !rate.trim()}>{t.rates.add}</button>
        </form>
      )}
    </section>
  );
}

// The accounts of the journal export.
function JournalAccounts({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run } = useRun(errors);
  const fields = [["code", t.journal.code], ["employees", t.journal.employees], ["vat", t.journal.vat], ["card", t.journal.card]] as const;
  return (
    <section id="journal" className="paper" aria-labelledby="journal-title">
      <h2 id="journal-title">{t.journal.title}</h2>
      <p className="hint">{t.journal.intro}</p>
      <hr className="rule" />
      <div className="journal-grid">
        {fields.map(([key, label]) => (
          <div key={key} className="field-row">
            <label htmlFor={`journal-${key}`}>{label}</label>
            <input id={`journal-${key}`} className="field mono" defaultValue={company.journal[key]} maxLength={key === "code" ? 10 : 20}
              onBlur={e => { const v = e.target.value.trim(); if (v !== company.journal[key]) run(() => updateCompany({ journal: { [key]: v } }), () => t.company.saved); }} />
          </div>
        ))}
      </div>
    </section>
  );
}

// Everyone's vehicle and its registration certificate, checked or not.
function Vehicles({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  return (
    <section id="vehicles" className="paper" aria-labelledby="vehicles-title">
      <h2 id="vehicles-title">{t.vehicles.title}</h2>
      <p className="hint">{t.vehicles.intro}</p>
      <hr className="rule" />
      {company.vehicles.length === 0 ? <p className="hint">{t.vehicles.empty}</p> : (
        <ul className="people-list vehicles-list">
          {company.vehicles.map(v => (
            <li key={v.member}>
              <Avatar name={v.name} photo={null} />
              <span><strong>{v.name}</strong><br /><span className="hint">{v.label}</span></span>
              <span className="proof-line">
                {v.proof ? <a href={v.proof} target="_blank" rel="noopener">{t.vehicles.open}</a> : <span className="hint">{t.vehicles.none}</span>}
                {v.proof && (
                  <label className="check">
                    <input type="checkbox" defaultChecked={v.checked} disabled={pending} onChange={e => run(() => checkVehicle(v.member, e.target.checked), () => t.vehicles.saved)} />
                    {t.vehicles.check}<span className="visually-hidden">: {v.name}</span>
                  </label>
                )}
                {v.proof && !v.checked && <StatusBadge tone="wait" label={t.vehicles.unchecked} size="s" />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Rates are typed as people read them on impots.gouv.fr ("0,636" €/km);
// the scale keeps thousandths of a euro.
const rateText = (milli: number, locale: string) => new Intl.NumberFormat(intl(locale), { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(milli / 1000);
const readRate = (text: string) => Math.round(Number(text.replace(/\s/gu, "").replace(",", ".")) * 1000);
const readWhole = (text: string) => Number(text.replace(/[\s  .]/gu, "").replace(",", ""));

function ScaleEditor({ company, locale, t, errors }: { company: Company; locale: string; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const years = company.scales.map(s => s.year);
  const [year, setYear] = useState(years[0] ?? company.year);
  const base = company.scales.find(s => s.year === year) ?? company.scales[0];
  const [draft, setDraft] = useState<{ year: number; data: Scale; source: string } | null>(null);
  const shown = draft && draft.year === year ? draft : base ? { year, data: structuredClone(base.data), source: base.source } : null;
  if (!shown) return null;
  const edit = (change: (d: Scale) => void) => {
    const next = structuredClone(shown);
    change(next.data);
    setDraft(next);
  };
  const next = Math.max(company.year, ...years) + (years.includes(company.year) ? 1 : 0);
  return (
    <section id="scale" className="paper" aria-labelledby="scale-title">
      <div className="paper-head">
        <h2 id="scale-title">{t.scale.title}</h2>
        <Stamp kind="submitted" text={t.scale.check} />
      </div>
      <p className="hint">{t.scale.intro}</p>
      {company.fallback && <p className="notice scale-fallback">{company.fallback}</p>}
      <hr className="rule" />
      <div className="year-tabs" role="group" aria-label={t.scale.year}>
        {years.map(y => <button key={y} type="button" className="chip small" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
        {!years.includes(next) && <button type="button" className="chip small" onClick={() => { setDraft({ year: next, data: structuredClone(shown.data), source: "" }); setYear(next); }}>{format(t.scale.add, { year: next })}</button>}
      </div>
      <form onSubmit={e => { e.preventDefault(); run(() => saveScale(shown.year, shown.data, shown.source), () => { setDraft(null); return t.scale.saved; }); }} className="form-grid">
        {company.kinds.map(k => {
          const table = shown.data[k.value];
          return (
            <div key={k.value} className="table-wrap">
              <table className="grid">
                <caption className="label">{k.label}</caption>
                <thead>
                  <tr>
                    <th>{t.scale.power}</th>
                    <th>{format(t.scale.band1, { a: new Intl.NumberFormat(intl(locale)).format(table.limits[0]) })}</th>
                    <th colSpan={2}>{format(t.scale.band2, { a: new Intl.NumberFormat(intl(locale)).format(table.limits[0]), b: new Intl.NumberFormat(intl(locale)).format(table.limits[1]) })}</th>
                    <th>{format(t.scale.band3, { b: new Intl.NumberFormat(intl(locale)).format(table.limits[1]) })}</th>
                  </tr>
                  <tr><th /><th>{t.scale.rate}</th><th>{t.scale.rate}</th><th>{t.scale.fixed}</th><th>{t.scale.rate}</th></tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => {
                    const who = `${k.label} ${k.powers[row.power] ?? row.power}`;
                    const rate = (b: 0 | 1 | 2) => (
                      <td key={`r${b}`}>
                        <input className="field num mono" aria-label={`${who} · ${t.scale.rate} (${b + 1})`} defaultValue={rateText(row.bands[b][0], locale)} key={`${shown.year}-${k.value}-${ri}-${b}`}
                          onBlur={e => { const v = readRate(e.target.value); if (Number.isFinite(v)) edit(d => { d[k.value].rows[ri]!.bands[b][0] = v; }); }} />
                      </td>
                    );
                    return (
                      <tr key={row.power}>
                        <td>{k.powers[row.power] ?? row.power}</td>
                        {rate(0)}
                        {rate(1)}
                        <td>
                          <input className="field num short mono" aria-label={`${who} · ${t.scale.fixed}`} defaultValue={String(row.bands[1][1])} key={`${shown.year}-${k.value}-${ri}-f`}
                            onBlur={e => { const v = readWhole(e.target.value); if (Number.isFinite(v)) edit(d => { d[k.value].rows[ri]!.bands[1][1] = v; }); }} />
                        </td>
                        {rate(2)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="two stack">
          <div className="field-row">
            <label htmlFor="bonus">{t.scale.electricBonus}</label>
            <input id="bonus" className="field mono" inputMode="numeric" defaultValue={String(shown.data.electricBonus)} key={`${shown.year}-bonus`} onBlur={e => { const v = readWhole(e.target.value); if (Number.isFinite(v)) edit(d => { d.electricBonus = v; }); }} />
          </div>
          <div className="field-row">
            <label htmlFor="source">{t.scale.source}</label>
            <input id="source" className="field" maxLength={500} value={shown.source} onChange={e => setDraft({ ...shown, source: e.target.value })} />
          </div>
        </div>
        <div><button type="submit" className="button" disabled={pending}>{format(t.scale.save, { year: shown.year })}</button></div>
      </form>
    </section>
  );
}
