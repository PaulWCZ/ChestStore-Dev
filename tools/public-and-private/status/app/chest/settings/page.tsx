import { PageHeader } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { db } from "../../../lib/db.ts";
import { pageSettings } from "../../../lib/page-settings.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { listSubscribers } from "../../../lib/subscribers.ts";
import { listTemplates } from "../../../lib/templates.ts";
import { currentLook } from "../../../lib/theme.ts";
import { SettingsView } from "./settings-view.tsx";

// Settings: the company on the page (website, support; the brand comes
// from the Chest), the page on other sites (badge, banner, JSON API),
// templates, import from Statuspage, download everything.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const [settings, templates, look, subscribers] = await Promise.all([pageSettings(sql), listTemplates(sql, member), currentLook(), listSubscribers(sql, member)]);
  const origin = publicOrigin(await headers()) ?? "";
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.settings.title} />
      <SettingsView
        origin={origin}
        settings={{ website: settings.website ?? "", support: (settings.support ?? "").replace(/^mailto:/u, ""), embedSites: settings.embedSites.join("\n") }}
        look={look.source}
        subscribers={plural(t.subscribers.count, subscribers.filter(s => s.confirmedAt).length, locale)}
        templates={templates.map(x => ({ id: x.id, name: x.name, title: x.title }))}
        t={{ settings: t.settings, errors: t.errors, widget: t.public.widgetTitle, files: t.files, subscribers: t.shell.subscribers }}
      />
    </div>
  );
}
