import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { vehicleKinds } from "../../../lib/scale.ts";
import { viewer } from "../../../lib/session.ts";
import { priorDistance, scaleFor, vehicleOf, vehicleProof } from "../../../lib/settings.ts";
import { bankDetails } from "../../../lib/bank.ts";
import { relative } from "../../../lib/i18n/index.ts";
import { powerName, vehicleName } from "../../../lib/words.ts";
import { SettingsNav } from "./settings-nav.tsx";
import { MyView } from "./settings-view.tsx";

// Settings → Me: what each person sets once for themselves — their vehicle
// (car trips).
export default async function MySettings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
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
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t.settings.title}</h1>
        {can(member, "settings") && <SettingsNav current="me" t={t.settings} />}
      </div>
      <MyView vehicle={vehicleData} bank={bank && { masked: bank.masked, bic: bank.bic, holder: bank.holder, since: relative(bank.updatedAt, locale) }} t={{ ...t.settings, files: t.files, table: t.table }} errors={t.errors} cancel={t.form.cancel} />
    </div>
  );
}
