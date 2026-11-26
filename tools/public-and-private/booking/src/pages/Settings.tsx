import { PageHeader } from "@argentic/chest-ui/components";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import type { MemberContext } from "@argentic/chest-app";
import { format } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import * as b from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { mailInfo } from "../lib/mailer.ts";
import { myPage } from "../lib/my-page.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { zoneGroups } from "../lib/zones.ts";
import { sheetOf } from "../theme.ts";

// The Chest's page of the member's calendar feed, on the team host (the
// Chest's front serves it; SDK 0.4.1-studio.2 dropped calendar.page).
const chestCalendarPage = "/_chest/calendar";

// Settings (/chest/settings): the host's page (address, welcome, listing,
// calendar), moving from Calendly, and, for administrators, the company's
// settings and its website.
export async function settingsPage(v: PageContext<MemberContext>): Promise<View> {
  const { member, t, locale, request } = v;
  const host = await myPage(v);
  // The button a website pastes wears the public pages' look.
  const look = (await sheetOf("public")).look;
  const s = await b.settings(db());
  const origin = publicOrigin(request.headers) ?? "";
  const admin = can(member, "settings");
  const zones = zoneGroups(t.zones, Date.now(), [s.defaultZone, host?.zone ?? s.defaultZone]);
  // Asked of the Chest (studio.16); when it does not answer, what the last
  // email taught.
  const { state: mailing, replyTo } = await mailInfo();
  const noMail = mailing === "not_connected" ? t.settings.noMailConnect : mailing === "suspended" ? t.settings.noMailSuspended : mailing === "quota" ? t.settings.noMailQuota
    : mailing === "not_granted" || (mailing === "unknown" && s.mailWorks === false) ? t.settings.noMail : null;
  const words = { settings: t.settings, files: t.kit.files };
  return {
    title: t.settings.title,
    body: (
      <>
        <PageHeader size="m" title={t.settings.title} />
        {noMail && <p className="notice spaced">{noMail}</p>}
        {!noMail && replyTo && <p className="hint spaced">{format(t.settings.replies, { address: replyTo })}</p>}
        {host && <Island name="PageSettings" props={{ host: { slug: host.slug, welcome: host.welcome, listed: host.listed, hasFeed: host.hasFeed, dailyMax: host.dailyMax, language: host.language ?? locale, second: host.second ?? "", welcomeAlt: host.welcomeAlt }, chestCalendar: s.calendarWorks === false ? null : chestCalendarPage, origin, t: { ...words, languages: t.languages } }} />}
        {host && <Island name="ImportCalendly" props={{ zone: host.zone, zones, locale, t: words }} />}
        <Island name="CompanySettings" props={{ admin, settings: { companyName: s.companyName, retentionMonths: s.retentionMonths, defaultZone: s.defaultZone }, zones, locale, t: words }} />
        {admin && <Island name="EmbedSettings" props={{ sites: s.embedOrigins, origin, colors: { accent: look.theme.light.accent, ink: look.theme.light["accent-ink"] }, t: words }} />}
      </>
    ),
  };
}
