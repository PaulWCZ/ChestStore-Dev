import * as chest from "@argentic/chest-sdk/chest";
import { can } from "../../../lib/access.ts";
import { company, missing } from "../../../lib/company.ts";
import { db } from "../../../lib/db.ts";
import { documentNumber } from "../../../lib/model.ts";
import { viewer } from "../../../lib/session.ts";
import { SettingsView } from "./settings-view.tsx";

// The company's legal details and the documents' defaults: the admin's.
// Everyone else reads them (they print on every document).
export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const c = await company(db());
  const year = Number(chest.today().slice(0, 4));
  return (
    <SettingsView
      t={t}
      locale={locale}
      company={c}
      missing={missing(c)}
      canEdit={can(member, "settings")}
      currency={chest.currency()}
      year={year}
      sample={documentNumber("X", year, 1)}
      logo={c.logo ? `/chest/logo?v=${encodeURIComponent(c.logo)}` : null}
    />
  );
}
