import { Island, type PageContext, type View } from "@argentic/chest-app";
import { SettingsNav } from "../components/settings-nav.tsx";
import { format, localeOf, relative } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { bankCurrent, bankDetails } from "../lib/bank.ts";
import { db } from "../lib/db.ts";
import { addressCountries } from "../shared/iban.ts";
import { nameOf, people } from "../lib/people.ts";
import { vehicleKinds } from "../shared/scale.ts";
import { priorDistance, scaleFor, vehicleOf, vehicleProof } from "../lib/settings.ts";
import { today } from "../lib/today.ts";
import { countryOptions, powerName, vehicleName } from "../shared/words.ts";

// Settings → Me: what each person sets once for themselves — their vehicle
// (car trips).
export async function mySettingsPage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const year = Number(today().slice(0, 4));
  const [vehicle, current, bank, proof] = await Promise.all([vehicleOf(sql, member.id), scaleFor(sql, year), bankDetails(sql, member, member.id), vehicleProof(sql, member.id)]);
  const prior = vehicle ? await priorDistance(sql, member.id, year, vehicle.kind) : 0;
  const vehicleData = {
    kinds: vehicleKinds.map(k => ({ value: k, label: vehicleName(k, t) })),
    powers: Object.fromEntries(vehicleKinds.map(k => [k, current.data[k].rows.map(r => ({ value: r.power, label: powerName(k, r.power, t) }))])),
    current: vehicle,
    electric: format(t.settings.vehicle.electric, { bonus: current.data.electricBonus }),
    prior: { year, value: prior === 0 ? "" : String(prior / 10).replace(".", locale === "fr" ? "," : ".") },
    proof: proof && { name: proof.name, href: `/chest/vehicles/${member.id}/proof`, checked: proof.checkedAt !== null },
  };
  // Bank details someone else entered: the owner is asked to confirm them.
  const held = bank?.held ? format(t.settings.bank.heldTitle, { name: nameOf((await people([bank.updatedBy])).get(bank.updatedBy), locale), when: relative(bank.updatedAt, locale) }) : null;
  return {
    title: t.settings.title,
    body: (
      <div className="page">
        <div className="page-head">
          <h1>{t.settings.title}</h1>
          {can(member, "settings") && <SettingsNav current="me" t={t.settings} />}
        </div>
        <Island name="MyView" props={{ vehicle: vehicleData, bank: bankCurrent(bank, locale), held, countries: countryOptions(addressCountries, locale), t: { ...t.settings, files: t.files, table: t.table }, errors: t.errors, cancel: t.form.cancel }} />
      </div>
    ),
  };
}
