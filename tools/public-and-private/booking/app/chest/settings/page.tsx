import { headers } from "next/headers";
import { can } from "../../../lib/access.ts";
import * as b from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { CompanySettings, PageSettings } from "./settings-view.tsx";

// The host's page (address, welcome, listing, calendar feed) and, for
// administrators, the company's settings.
export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const host = await myPage(v);
  const s = await b.settings(db());
  const origin = publicOrigin(await headers()) ?? "";
  const admin = can(member, "settings");
  return (
    <>
      <div className="page-head"><h1>{t.settings.title}</h1></div>
      {s.mailWorks === false && <p className="notice" style={{ marginBottom: "var(--space-5)" }}>{t.settings.noMail}</p>}
      {host && <PageSettings host={{ slug: host.slug, welcome: host.welcome, listed: host.listed, hasFeed: host.hasFeed }} origin={origin} t={{ settings: t.settings, errors: t.errors }} />}
      <CompanySettings admin={admin} settings={{ companyName: s.companyName, retentionMonths: s.retentionMonths, defaultZone: s.defaultZone }} locale={locale} t={{ settings: t.settings, errors: t.errors }} />
    </>
  );
}
