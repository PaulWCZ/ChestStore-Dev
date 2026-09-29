import * as files from "@argentic/chest-sdk/files";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { countryNames } from "../../../lib/countries.ts";
import { db } from "../../../lib/db.ts";
import { locales } from "../../../lib/i18n/index.ts";
import { introFor, settings } from "../../../lib/jobs.ts";
import { templates } from "../../../lib/messages.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { SettingsView } from "./settings-view.tsx";

// The careers page's settings: its name, its words in each language, its
// look, open or closed; where job boards read the jobs; the email
// templates; how long candidates' data is kept; everything as one export.
export default async function Settings() {
  const v = await viewer();
  if (!v || !can(v.member, "settings")) notFound();
  const { t, locale, member } = v;
  const sql = db();
  const s = await settings(sql);
  const origin = publicOrigin(await headers()) ?? "";
  const url = (image: { object: string; version: string }) => files.publicUrl(image.object, { version: image.version });
  const own = await templates(sql, member);
  return (
    <div className="narrow">
      <div className="page-head"><h1>{t.settings.title}</h1></div>
      <SettingsView
        settings={{ companyName: s.ownName, intros: Object.fromEntries(locales.map(l => [l, introFor(s, l)])), careersOpen: s.careersOpen, retentionMonths: s.retentionMonths, country: s.country, website: s.website, accent: s.accent }}
        fallbackName={s.companyName}
        address={origin + "/"}
        feeds={{ indeed: origin + "/jobs.xml", rss: origin + "/feed.xml", sitemap: origin + "/sitemap.xml" }}
        logo={s.logo ? url(s.logo) : null}
        photos={s.photos.map(p => ({ object: p.object, url: url(p) }))}
        templates={own.map(x => ({ id: x.id, name: x.name, language: x.language, subject: x.subject, body: x.body }))}
        countryNames={countryNames(locale)}
        t={{ settings: t.settings, retention: t.retention, errors: t.errors, common: t.common, careers: t.careers, templatesWords: t.templates }}
      />
    </div>
  );
}
