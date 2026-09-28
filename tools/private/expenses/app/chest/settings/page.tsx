import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { commonCurrencies, inputAmount } from "../../../lib/money.ts";
import { holders } from "../../../lib/people.ts";
import { vehicleKinds } from "../../../lib/scale.ts";
import { viewer } from "../../../lib/session.ts";
import { approverMap, categories, scaleFor, scales, settings, vehicleOf } from "../../../lib/settings.ts";
import { categoryName, powerName, vehicleName } from "../../../lib/words.ts";
import { SettingsView } from "./settings-view.tsx";

// Settings: everyone's vehicle; for the accountants, the company's
// currency and reminder, the categories, who approves whom, the mileage
// scale.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const year = Number(today().slice(0, 4));
  const [vehicle, current] = await Promise.all([vehicleOf(sql, member.id), scaleFor(sql, year)]);
  const powersOf = Object.fromEntries(vehicleKinds.map(k => [k, current.data[k].rows.map(r => ({ value: r.power, label: powerName(k, r.power, t) }))]));
  const vehicleData = {
    kinds: vehicleKinds.map(k => ({ value: k, label: vehicleName(k, t) })),
    powers: powersOf,
    current: vehicle,
    electric: format(t.settings.vehicle.electric, { bonus: current.data.electricBonus }),
  };
  if (!can(member, "settings")) {
    return (
      <main className="page">
        <div className="page-head"><h1>{t.settings.title}</h1></div>
        <SettingsView locale={locale} vehicle={vehicleData} company={null} t={t.settings} errors={t.errors} />
      </main>
    );
  }
  const [company, cats, map, all, everyone] = await Promise.all([settings(sql), categories(sql, { archived: true }), approverMap(sql), scales(sql), holders()]);
  const approvers = everyone.filter(h => h.role === "approver" || h.role === "accountant");
  const withRole = everyone.filter(h => h.role !== null);
  return (
    <main className="page wide">
      <div className="page-head"><h1>{t.settings.title}</h1></div>
      <SettingsView
        locale={locale}
        vehicle={vehicleData}
        company={{
          currency: company.currency,
          currencies: [...new Set([company.currency, ...commonCurrencies])],
          reminder: company.reminder,
          categories: cats.map(c => ({ id: c.id, name: c.name ?? "", placeholder: c.key ? categoryName({ key: c.key, name: null }, t) : "", account: c.account, vatRecovery: String(c.vatRecovery), cap: c.cap === null ? "" : inputAmount(c.cap, company.currency, locale), mileage: c.mileage, archived: c.archived })),
          people: withRole.map(h => ({ id: h.id, name: h.name, photo: h.photo, role: t.roles[h.role as keyof typeof t.roles] ?? "", approver: map.get(h.id) ?? "" })),
          approvers: approvers.map(h => ({ id: h.id, name: h.name })),
          scales: all.map(s => ({ year: s.year, data: s.data, source: s.source })),
          year,
          fallback: all.some(s => s.year === year) ? null : format(t.settings.scale.fallback, { year, from: current.year }),
          kinds: vehicleKinds.map(k => ({ value: k, label: vehicleName(k, t), powers: Object.fromEntries(current.data[k].rows.map(r => [r.power, powerName(k, r.power, t)])) })),
        }}
        t={t.settings}
        errors={t.errors}
      />
    </main>
  );
}
