import { Island, type MemberContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { pageSettings } from "../lib/page-settings.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { listSubscribers } from "../lib/subscribers.ts";
import { listTemplates } from "../lib/templates.ts";
import { lookOf } from "../lib/theme.ts";

// Settings: the company on the page (website, support; the brand comes
// from the Chest), the page on other sites (badge, banner, JSON API),
// templates, import from Statuspage, download everything.
export async function settingsPage({ member, locale: language, t, request }: MemberContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [settings, templates, look, subscribers] = await Promise.all([pageSettings(sql), listTemplates(sql, member), lookOf("team"), listSubscribers(sql, member)]);
  const origin = publicOrigin(request.headers) ?? "";
  return { title: t.settings.title, body: (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.settings.title} />
      <Island name="SettingsView" props={{
        origin,
        settings: { website: settings.website ?? "", support: (settings.support ?? "").replace(/^mailto:/u, ""), embedSites: settings.embedSites.join("\n") },
        look: look.source,
        subscribers: plural(t.subscribers.count, subscribers.filter(s => s.confirmedAt).length, locale),
        templates: templates.map(x => ({ id: x.id, name: x.name, title: x.title })),
        t: { settings: t.settings, errors: t.errors, widget: t.public.widgetTitle, files: t.files, subscribers: t.shell.subscribers },
      }} />
    </div>
  ) };
}
