import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { allComponents } from "../../../../lib/components.ts";
import { db } from "../../../../lib/db.ts";
import { format, locales, zoneName } from "../../../../lib/i18n/index.ts";
import { pickerGroups } from "../../../../lib/picker.ts";
import { listTemplates } from "../../../../lib/templates.ts";
import { viewer } from "../../../../lib/session.ts";
import { wall } from "../../../../lib/zone.ts";
import { IncidentForm } from "./incident-form.tsx";

// Post an incident, in one screen.
export default async function NewIncident({ searchParams }: { searchParams: Promise<{ component?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, member } = v;
  const zone = chest.timeZone();
  const all = await allComponents(db(), { locale: v.locale });
  const groups = pickerGroups(all);
  // From an automatic check that failed: the service, a major outage and
  // words to start from — an editor still reads and posts them.
  const wanted = (await searchParams).component;
  const from = all.find(c => c.kind === "component" && c.id === wanted);
  const start = from ? { states: { [from.id]: "major" as const }, title: format(t.checks.incidentTitle, { component: from.name }), body: format(t.checks.incidentBody, { component: from.name }) } : null;
  const now = wall(Date.now(), zone);
  const rounded = Math.floor(now.minutes / 5) * 5;
  return (
    <div className="narrow stack-l">
      <PageHeader size="m" title={t.compose.newTitle} />
      {groups.length === 0 ? (
        <EmptyState title={t.overview.setup} body={t.compose.noComponents} action={<a className="button" href="/chest/components">{t.overview.setupAction}</a>} />
      ) : (
        <IncidentForm
          groups={groups}
          start={start}
          templates={await listTemplates(db(), member)}
          languages={{ main: v.locale, options: locales.map(code => ({ code, name: t.languages[code] })) }}
          today={now.date}
          nowMinutes={rounded}
          zoneNote={format(t.maintenance.zone, { zone: zoneName(zone) })}
          t={{ compose: t.compose, states: t.states, steps: t.steps, stepHelp: t.stepHelp, errors: t.errors, date: t.date }}
        />
      )}
    </div>
  );
}
