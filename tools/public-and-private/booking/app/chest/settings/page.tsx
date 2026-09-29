import * as calendar from "@argentic/chest-sdk/calendar";
import { PageHeader } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { can } from "../../../lib/access.ts";
import * as b from "../../../lib/booking.ts";
import { db } from "../../../lib/db.ts";
import { myPage } from "../../../lib/my-page.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { currentLook } from "../../../lib/theme.ts";
import { zoneGroups } from "../../../lib/zones.ts";
import { CompanySettings, EmbedSettings, ImportCalendly, PageSettings } from "./settings-view.tsx";

// The host's page (address, welcome, listing, calendar), moving from
// Calendly, and, for administrators, the company's settings.
export default async function SettingsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const host = await myPage(v);
  const look = await currentLook();
  const s = await b.settings(db());
  const origin = publicOrigin(await headers()) ?? "";
  const admin = can(member, "settings");
  const zones = zoneGroups(t.zones, Date.now(), [s.defaultZone, host?.zone ?? s.defaultZone]);
  return (
    <>
      <PageHeader size="m" title={t.settings.title} />
      {s.mailWorks === false && <p className="notice spaced">{t.settings.noMail}</p>}
      {host && <PageSettings host={{ slug: host.slug, welcome: host.welcome, listed: host.listed, hasFeed: host.hasFeed, emailMe: host.emailMe, dailyMax: host.dailyMax, language: host.language ?? locale, second: host.second ?? "", welcomeAlt: host.welcomeAlt }} chestCalendar={s.calendarWorks === false ? null : calendar.page} origin={origin} t={{ settings: t.settings, errors: t.errors, files: t.files, languages: t.languages }} />}
      {host && <ImportCalendly zone={host.zone} zones={zones} locale={locale} t={{ settings: t.settings, errors: t.errors, files: t.files }} />}
      <CompanySettings admin={admin} settings={{ companyName: s.companyName, retentionMonths: s.retentionMonths, defaultZone: s.defaultZone }} zones={zones} locale={locale} t={{ settings: t.settings, errors: t.errors, files: t.files }} />
      {admin && <EmbedSettings sites={s.embedOrigins} origin={origin} colors={{ accent: look.theme.light.accent, ink: look.theme.light["accent-ink"] }} t={{ settings: t.settings, errors: t.errors, files: t.files }} />}
    </>
  );
}
