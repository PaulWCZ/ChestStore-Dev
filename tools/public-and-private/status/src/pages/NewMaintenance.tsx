import { chest } from "@argentic/chest-sdk/chest";
import { Island, type MemberContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { format, localeOf, locales, zoneName } from "../i18n/index.ts";
import { allComponents } from "../lib/components.ts";
import { db } from "../lib/db.ts";
import { pickerGroups } from "../lib/picker.ts";
import { addDays } from "../lib/zone.ts";

// Plan a maintenance: tomorrow evening by default, an hour long.
export async function newMaintenance({ locale: language, t }: MemberContext): Promise<View> {
  const locale = localeOf(language);
  const zone = chest.timeZone;
  const groups = pickerGroups(await allComponents(db(), { locale }));
  const today = chest.today();
  const tomorrow = addDays(today, 1);
  return { title: t.maintenance.newTitle, body: (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.maintenance.newTitle} />
      {groups.length === 0 ? (
        <EmptyState title={t.overview.setup} body={t.compose.noComponents} action={<a className="button" href="/chest/components">{t.overview.setupAction}</a>} />
      ) : (
        <Island name="MaintenanceForm" props={{
          groups,
          start: { day: tomorrow, minutes: 22 * 60 },
          end: { day: tomorrow, minutes: 23 * 60 },
          today,
          zoneNote: format(t.maintenance.zone, { zone: zoneName(zone) }),
          languages: { main: locale, options: locales.map(code => ({ code, name: t.languages[code] })) },
          t: { maintenance: t.maintenance, compose: t.compose, errors: t.errors, date: t.date },
        }} />
      )}
    </div>
  ) };
}
