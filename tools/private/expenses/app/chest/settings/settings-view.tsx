"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { Car } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, intl } from "../../../lib/i18n/format.ts";
import type { Result } from "../../../lib/errors.ts";
import type { Scale, VehicleKind } from "../../../lib/scale.ts";
import { addCategory, saveScale, setApprover, setVehicle, updateCategory, updateCompany } from "../actions.ts";

type Option = { value: string; label: string };
type Words = Catalogue["settings"];
type Errors = Catalogue["errors"];
type CategoryRow = { id: string; name: string; placeholder: string; account: string; vatRecovery: string; cap: string; mileage: boolean; archived: boolean };
type Company = {
  currency: string;
  currencies: string[];
  reminder: boolean;
  categories: CategoryRow[];
  people: { id: string; name: string; photo: string | null; role: string; approver: string }[];
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
      toast(format(errors[result.error], result.values ?? {}));
      return;
    }
    const message = done?.(result.value);
    if (message) toast(message);
    router.refresh();
  });
  return { run, pending };
}

export function SettingsView({ locale, vehicle, company, t, errors }: {
  locale: string;
  vehicle: { kinds: Option[]; powers: Record<string, Option[]>; current: { kind: string; power: string; electric: boolean } | null; electric: string };
  company: Company | null;
  t: Words;
  errors: Errors;
}) {
  return (
    <div className="settings">
      <VehicleForm vehicle={vehicle} t={t} errors={errors} />
      {company && <CompanyForm company={company} t={t} errors={errors} />}
      {company && <Categories company={company} t={t} errors={errors} />}
      {company && <Approvers company={company} t={t} errors={errors} />}
      {company && <ScaleEditor company={company} locale={locale} t={t} errors={errors} />}
    </div>
  );
}

function VehicleForm({ vehicle, t, errors }: { vehicle: { kinds: Option[]; powers: Record<string, Option[]>; current: { kind: string; power: string; electric: boolean } | null; electric: string }; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  const [kind, setKind] = useState(vehicle.current?.kind ?? "car");
  const powers = vehicle.powers[kind] ?? [];
  const [power, setPower] = useState(vehicle.current?.power ?? powers[2]?.value ?? powers[0]?.value ?? "");
  const [electric, setElectric] = useState(vehicle.current?.electric ?? false);
  return (
    <section id="vehicle" className="paper" aria-labelledby="vehicle-title">
      <h2 id="vehicle-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Car />{t.vehicle.title}</h2>
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
    </section>
  );
}

function CompanyForm({ company, t, errors }: { company: Company; t: Words; errors: Errors }) {
  const { run, pending } = useRun(errors);
  return (
    <section className="paper" aria-labelledby="company-title">
      <h2 id="company-title">{t.company.title}</h2>
      <hr className="rule" />
      <div className="form-grid">
        <div className="field-row" style={{ maxWidth: 320 }}>
          <label htmlFor="currency">{t.company.currency}</label>
          <select id="currency" className="field" defaultValue={company.currency} disabled={pending} onChange={e => run(() => updateCompany({ currency: e.target.value }), () => t.company.saved)}>
            {company.currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="check"><input type="checkbox" defaultChecked={company.reminder} disabled={pending} onChange={e => run(() => updateCompany({ reminder: e.target.checked }), () => t.company.saved)} />{t.company.reminder}</label>
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
    <section className="paper" aria-labelledby="categories-title">
      <h2 id="categories-title">{t.categories.title}</h2>
      <p className="hint">{t.categories.intro}</p>
      <hr className="rule" />
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr><th>{t.categories.name}</th><th>{t.categories.account}</th><th>{t.categories.vatRecovery}</th><th title={t.categories.capHint}>{t.categories.cap}</th><th><span className="visually-hidden">{t.categories.hide}</span></th></tr>
          </thead>
          <tbody>
            {company.categories.map(c => (
              <tr key={c.id} className={c.archived ? "hidden" : undefined}>
                <td>
                  <label className="visually-hidden" htmlFor={`cat-name-${c.id}`}>{t.categories.name}</label>
                  <input id={`cat-name-${c.id}`} className="field" defaultValue={c.name} placeholder={c.placeholder} maxLength={60} onBlur={e => save(c.id, "name", e.target.value.trim(), c.name)} />
                  {c.mileage && <span className="hint">{t.categories.mileage}</span>}
                </td>
                <td><label className="visually-hidden" htmlFor={`cat-account-${c.id}`}>{t.categories.account}</label><input id={`cat-account-${c.id}`} className="field num mono" defaultValue={c.account} maxLength={20} onBlur={e => save(c.id, "account", e.target.value.trim(), c.account)} /></td>
                <td><label className="visually-hidden" htmlFor={`cat-vat-${c.id}`}>{t.categories.vatRecovery}</label><input id={`cat-vat-${c.id}`} className="field num short" inputMode="numeric" defaultValue={c.vatRecovery} onBlur={e => save(c.id, "vatRecovery", e.target.value.trim(), c.vatRecovery)} /></td>
                <td>{!c.mileage && <><label className="visually-hidden" htmlFor={`cat-cap-${c.id}`}>{t.categories.cap}</label><input id={`cat-cap-${c.id}`} className="field num" inputMode="decimal" defaultValue={c.cap} placeholder="—" onBlur={e => save(c.id, "cap", e.target.value.trim(), c.cap)} /></>}</td>
                <td>{!c.mileage && <button type="button" className="link-button" disabled={pending} onClick={() => run(() => updateCategory(c.id, { archived: !c.archived }))}>{c.archived ? t.categories.show : t.categories.hide}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="pay-form" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); if (name.trim()) run(() => addCategory({ name }), () => { setName(""); return t.company.saved; }); }}>
        <div className="field-row" style={{ flex: "1 1 240px" }}>
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
    <section className="paper" aria-labelledby="approvers-title">
      <h2 id="approvers-title">{t.approvers.title}</h2>
      <p className="hint">{t.approvers.intro}</p>
      <hr className="rule" />
      {company.people.length === 0 ? <p className="hint">{t.approvers.none}</p> : (
        <ul className="people-list">
          {company.people.map(p => (
            <li key={p.id}>
              <Avatar name={p.name} photo={p.photo} />
              <span><strong>{p.name}</strong><br /><span className="hint">{p.role}</span></span>
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
    <section className="paper" aria-labelledby="scale-title">
      <div className="paper-head">
        <h2 id="scale-title">{t.scale.title}</h2>
        <span className="stamp">{t.scale.check}</span>
      </div>
      <p className="hint">{t.scale.intro}</p>
      {company.fallback && <p className="notice" style={{ marginTop: 12 }}>{company.fallback}</p>}
      <hr className="rule" />
      <div className="year-tabs" role="group" aria-label={t.scale.year}>
        {years.map(y => <button key={y} type="button" className="chip small" aria-pressed={y === year} style={y === year ? { background: "var(--ink)", color: "var(--bg)" } : undefined} onClick={() => setYear(y)}>{y}</button>)}
        {!years.includes(next) && <button type="button" className="chip small" onClick={() => { setDraft({ year: next, data: structuredClone(shown.data), source: "" }); setYear(next); }}>{format(t.scale.add, { year: next })}</button>}
      </div>
      <form onSubmit={e => { e.preventDefault(); run(() => saveScale(shown.year, shown.data, shown.source), () => { setDraft(null); return t.scale.saved; }); }} className="form-grid">
        {company.kinds.map(k => {
          const table = shown.data[k.value];
          return (
            <div key={k.value} className="table-wrap">
              <table className="grid">
                <caption className="label" style={{ textAlign: "left", paddingBottom: 6 }}>{k.label}</caption>
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
