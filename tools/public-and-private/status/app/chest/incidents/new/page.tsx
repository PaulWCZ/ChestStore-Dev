import * as chest from "@argentic/chest-sdk/chest";
import { allComponents } from "../../../../lib/components.ts";
import { db } from "../../../../lib/db.ts";
import { format, zoneName } from "../../../../lib/i18n/index.ts";
import { pickerGroups } from "../../../../lib/picker.ts";
import { viewer } from "../../../../lib/session.ts";
import { wall } from "../../../../lib/zone.ts";
import { IncidentForm } from "./incident-form.tsx";

// Post an incident, in one screen.
export default async function NewIncident({ searchParams }: { searchParams: Promise<{ component?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  const zone = chest.timeZone();
  const all = await allComponents(db());
  const groups = pickerGroups(all);
  // From an automatic check that failed: the service, a major outage and
  // words to start from — an editor still reads and posts them.
  const wanted = (await searchParams).component;
  const from = all.find(c => c.kind === "component" && c.id === wanted);
  const start = from ? { states: { [from.id]: "major" as const }, title: format(t.checks.incidentTitle, { component: from.name }), body: format(t.checks.incidentBody, { component: from.name }) } : null;
  const now = wall(Date.now(), zone);
  const rounded = Math.floor(now.minutes / 5) * 5;
  return (
    <main className="narrow stack-l">
      <h1>{t.compose.newTitle}</h1>
      {groups.length === 0 ? (
        <div className="empty">
          <p>{t.compose.noComponents}</p>
          <a className="button" href="/chest/components">{t.overview.setupAction}</a>
        </div>
      ) : (
        <IncidentForm
          groups={groups}
          start={start}
          today={now.date}
          nowMinutes={rounded}
          zoneNote={format(t.maintenance.zone, { zone: zoneName(zone) })}
          t={{ compose: t.compose, states: t.states, steps: t.steps, stepHelp: t.stepHelp, errors: t.errors }}
        />
      )}
    </main>
  );
}
