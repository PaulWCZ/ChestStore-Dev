import { headers } from "next/headers";
import { brandLook } from "../../../lib/brand.ts";
import { db } from "../../../lib/db.ts";
import { pageSettings } from "../../../lib/page-settings.ts";
import { publicOrigin } from "../../../lib/public-origin.ts";
import { viewer } from "../../../lib/session.ts";
import { listTemplates } from "../../../lib/templates.ts";
import { SettingsView } from "./settings-view.tsx";

// Settings: the company on the page (website, support; the brand comes
// from the Chest), the page on other sites (badge, banner, JSON API),
// templates, import from Statuspage, download everything.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const sql = db();
  const [settings, templates, brand] = await Promise.all([pageSettings(sql), listTemplates(sql, member), brandLook()]);
  const origin = publicOrigin(await headers()) ?? "";
  return (
    <main className="narrow stack-l">
      <h1>{t.settings.title}</h1>
      <SettingsView
        origin={origin}
        settings={{ website: settings.website ?? "", support: (settings.support ?? "").replace(/^mailto:/u, ""), embedSites: settings.embedSites.join("\n") }}
        branded={Boolean(brand.css || brand.logo)}
        templates={templates.map(x => ({ id: x.id, name: x.name, title: x.title }))}
        t={{ settings: t.settings, errors: t.errors, widget: t.public.widgetTitle }}
      />
    </main>
  );
}
