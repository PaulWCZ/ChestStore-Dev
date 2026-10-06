import { chest } from "@argentic/chest-sdk/chest";
import { Island, type MemberContext, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { format, localeOf, locales, zoneName } from "../i18n/index.ts";
import { allComponents } from "../lib/components.ts";
import { db } from "../lib/db.ts";
import { pickerGroups } from "../lib/picker.ts";
import { listTemplates } from "../lib/templates.ts";
import { wall } from "../lib/zone.ts";

// Post an incident, in one screen.
export async function newIncident({ member, locale: language, t }: MemberContext, wanted: string | undefined): Promise<View> {
  const locale = localeOf(language);
  const zone = chest.timeZone;
  const all = await allComponents(db(), { locale });
  const groups = pickerGroups(all);
  // From an automatic check that failed: the service, a major outage and
  // words to start from — an editor still reads and posts them.
  const from = all.find(c => c.kind === "component" && c.id === wanted);
  const start = from ? { states: { [from.id]: "major" as const }, title: format(t.checks.incidentTitle, { component: from.name }), body: format(t.checks.incidentBody, { component: from.name }) } : null;
  const now = wall(Date.now(), zone);
  const rounded = Math.floor(now.minutes / 5) * 5;
  return { title: t.compose.newTitle, body: (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.compose.newTitle} />
      {groups.length === 0 ? (
        <EmptyState title={t.overview.setup} body={t.compose.noComponents} action={<a className="button" href="/chest/components">{t.overview.setupAction}</a>} />
      ) : (
        <Island name="IncidentForm" props={{
          groups,
          start,
          templates: await listTemplates(db(), member),
          languages: { main: locale, options: locales.map(code => ({ code, name: t.languages[code] })) },
          today: now.date,
          nowMinutes: rounded,
          zoneNote: format(t.maintenance.zone, { zone: zoneName(zone) }),
          t: { compose: t.compose, states: t.states, steps: t.steps, stepHelp: t.stepHelp, errors: t.errors, date: t.date },
        }} />
      )}
    </div>
  ) };
}
