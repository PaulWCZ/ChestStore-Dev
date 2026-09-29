import { NoAccess } from "@argentic/chest-ui/components";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { format } from "../../../../lib/i18n/index.ts";
import { today } from "../../../../lib/model.ts";
import { commonCurrencies, inputAmount } from "../../../../lib/money.ts";
import { holders } from "../../../../lib/people.ts";
import { vehicleKinds } from "../../../../lib/scale.ts";
import { viewer } from "../../../../lib/session.ts";
import { alone } from "../../../../lib/approvals.ts";
import { allowanceUnits, allowances, approverMap, cardRules, categories, memberAccounts, rates, scaleFor, scales, settings, vehicles } from "../../../../lib/settings.ts";
import { rateText } from "../../../../lib/money.ts";
import { bankCurrent, bankDetails } from "../../../../lib/bank.ts";
import { addressCountries } from "../../../../lib/iban.ts";
import { languageNames, locales } from "../../../../lib/i18n/index.ts";
import { remittance } from "../../../../lib/payments.ts";
import { sealing } from "../../../../lib/seal.ts";
import { allowanceName, categoryName, countryOptions, powerName, vehicleName } from "../../../../lib/words.ts";
import { SettingsNav } from "../settings-nav.tsx";
import { CompanyView } from "../settings-view.tsx";

// Settings → Company, for the accountants: currency and reminder, the
// categories, who approves whom, the mileage scale.
export default async function CompanySettings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "settings")) return <div className="page"><NoAccess title={t.noAccess.title} body={t.errors.forbidden} /></div>;
  const sql = db();
  const year = Number(today().slice(0, 4));
  const [company, cats, map, all, everyone, current, bank, flat, known, cars, accounts, words, lonely] = await Promise.all([
    settings(sql), categories(sql, { archived: true }), approverMap(sql), scales(sql), holders(), scaleFor(sql, year), bankDetails(sql, member, "company"),
    allowances(sql, { archived: true }), rates(sql), vehicles(sql, member), memberAccounts(sql), cardRules(sql), alone(sql),
  ]);
  const names = new Map(everyone.map(h => [h.id, h.name]));
  const approvers = everyone.filter(h => h.role === "approver" || h.role === "accountant");
  const withRole = everyone.filter(h => h.role !== null);
  return (
    <div className="page wide">
      <div className="page-head">
        <h1>{t.settings.title}</h1>
        <SettingsNav current="company" t={t.settings} />
      </div>
      <CompanyView
        locale={locale}
        company={{
          team: everyone.map(h => ({ id: h.id, name: h.name })),
          payer: company.payer,
          bank: bankCurrent(bank, locale),
          countries: countryOptions(addressCountries, locale),
          bankLocale: company.bankLocale,
          bankTexts: locales.map(l => ({ value: l, label: languageNames[l] ?? l, sample: remittance(l, "E12 E13") })),
          sealed: sealing(),
          journal: company.journal,
          vehicles: cars.map(c => ({ member: c.member, name: names.get(c.member) ?? t.people.unknown, label: `${vehicleName(c.kind, t)} · ${powerName(c.kind, c.power, t)}${c.electric ? " · " + t.trip.electric : ""}`, proof: c.proof ? `/chest/vehicles/${c.member}/proof` : null, checked: c.checked }))
            .sort((a, b) => a.name.localeCompare(b.name, locale)),
          allowances: flat.map(a => ({ id: a.id, name: a.name ?? "", placeholder: a.key ? allowanceName({ key: a.key, name: null }, t) : "", amount: inputAmount(a.amount, company.currency, locale), unit: a.unit, account: a.account, archived: a.archived })),
          units: allowanceUnits.map(u => ({ value: u, label: t.allowance.units[u] })),
          rates: known.map(r => ({ currency: r.currency, rate: rateText(r.rate, locale) })),
          currency: company.currency,
          currencies: [...new Set([company.currency, ...commonCurrencies])],
          reminder: company.reminder,
          categories: cats.map(c => ({ id: c.id, name: c.name ?? "", placeholder: c.key ? categoryName({ key: c.key, name: null }, t) : "", account: c.account, vatRecovery: String(c.vatRecovery), cap: c.cap === null ? "" : inputAmount(c.cap, company.currency, locale), mileage: c.mileage, archived: c.archived, guests: c.guests, perNight: c.perNight, allowance: c.key === "allowance" })),
          people: withRole.map(h => ({ id: h.id, name: h.name, photo: h.photo, role: t.roles[h.role as keyof typeof t.roles] ?? "", approver: map.get(h.id) ?? "", account: accounts.get(h.id) ?? "", accountant: h.role === "accountant", alone: lonely.includes(h.id) })),
          cardRules: words.map(r => ({ id: r.id, words: r.words, category: r.categoryId })),
          cardCategories: cats.filter(c => !c.archived && !c.mileage && c.key !== "allowance").map(c => ({ value: c.id, label: categoryName(c, t) })),
          approvers: approvers.map(h => ({ id: h.id, name: h.name })),
          scales: all.map(s => ({ year: s.year, data: s.data, source: s.source })),
          year,
          fallback: all.some(s => s.year === year) ? null : format(t.settings.scale.fallback, { year, from: current.year }),
          kinds: vehicleKinds.map(k => ({ value: k, label: vehicleName(k, t), powers: Object.fromEntries(current.data[k].rows.map(r => [r.power, powerName(k, r.power, t)])) })),
        }}
        t={{ ...t.settings, files: t.files, table: t.table }}
        errors={t.errors}
        cancel={t.form.cancel}
      />
    </div>
  );
}
