import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { localeOf, locales } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { countryNames } from "../lib/countries.ts";
import { db } from "../lib/db.ts";
import { introFor, settings, type PublicImage } from "../lib/jobs.ts";
import { templates } from "../lib/messages.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { sheetOf } from "../theme.ts";

// The careers page's settings: its name, its words in each language, its
// look, open or closed; where job boards read the jobs; the email
// templates; how long candidates' data is kept; everything as one export.
// Each accent's swatch wears its own colours (the team's look.css carries
// them, src/theme.ts); the images show through the team host
// (/chest/settings/images/…: the public files are the public host's).
export async function settingsPage({ member, t, locale: tag }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "settings")) notFound();
  const locale = localeOf(tag);
  const sql = db();
  const s = await settings(sql);
  const origin = publicOrigin() ?? "";
  // The careers page's look (its public surface): the brand, or Hiring's own.
  const look = (await sheetOf("public", s.accent)).look;
  const preview = (image: PublicImage) => `/chest/settings/images/${image.object.slice("public/brand/".length)}?v=${encodeURIComponent(image.version)}`;
  const own = await templates(sql, member);
  return {
    title: t.settings.title,
    body: (
      <div className="narrow">
        <PageHeader title={t.settings.title} />
        <Island id="settings" name="SettingsView" props={{
          settings: { companyName: s.ownName, intros: Object.fromEntries(locales.map(l => [l, introFor(s, l)])), careersOpen: s.careersOpen, retentionMonths: s.retentionMonths, country: s.country, website: s.website, accent: s.accent },
          fallbackName: s.companyName,
          locale,
          address: origin + "/",
          feeds: { indeed: origin + "/jobs.xml", rss: origin + "/feed.xml", sitemap: origin + "/sitemap.xml" },
          logo: s.logo ? preview(s.logo) : null,
          photos: s.photos.map(p => ({ object: p.object, url: preview(p) })),
          templates: own.map(x => ({ id: x.id, name: x.name, language: x.language, subject: x.subject, body: x.body, attachments: x.attachments.map(a => ({ file: a.file, name: a.name, type: a.type, size: a.size })) })),
          countryNames: countryNames(locale),
          look: look.source === "brand" ? "brand" : "own",
          t: { settings: t.settings, retention: t.retention, common: t.common, templatesWords: t.templates, files: t.kit.files, upload: { invalid: t.errors.file_invalid, tooLarge: t.errors.cv_too_large, unavailable: t.errors.unavailable, limit: t.errors.limit }, image: { invalid: t.errors.invalid, tooLarge: t.errors.too_large_image, unavailable: t.errors.unavailable, limit: t.errors.limit } },
        }} />
      </div>
    ),
  };
}
