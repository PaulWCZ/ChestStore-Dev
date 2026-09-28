import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { settings } from "../../../lib/jobs.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { SettingsView } from "./settings-view.tsx";

// The careers page's settings: its name, its words, open or closed, how
// long candidates' data is kept.
export default async function Settings() {
  const v = await viewer();
  if (!v || !can(v.member, "settings")) notFound();
  const { t } = v;
  const s = await settings(db());
  const address = (publicOrigin(await headers()) ?? "") + "/";
  return (
    <div className="narrow">
      <div className="page-head"><h1>{t.settings.title}</h1></div>
      <SettingsView settings={{ companyName: s.ownName, intro: s.intro, careersOpen: s.careersOpen, retentionMonths: s.retentionMonths }} fallbackName={s.companyName} address={address}
        t={{ settings: t.settings, retention: t.retention, errors: t.errors, common: t.common, careers: t.careers }} />
    </div>
  );
}
