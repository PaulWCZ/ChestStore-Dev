import * as chest from "@argentic/chest-sdk/chest";
import { allComponents } from "../../../../lib/components.ts";
import { db } from "../../../../lib/db.ts";
import { format, zoneName } from "../../../../lib/i18n/index.ts";
import { pickerGroups } from "../../../../lib/picker.ts";
import { viewer } from "../../../../lib/session.ts";
import { wall } from "../../../../lib/zone.ts";
import { IncidentForm } from "./incident-form.tsx";

// Post an incident, in one screen.
export default async function NewIncident() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  const zone = chest.timeZone();
  const groups = pickerGroups(await allComponents(db()));
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
          today={now.date}
          nowMinutes={rounded}
          zoneNote={format(t.maintenance.zone, { zone: zoneName(zone) })}
          t={{ compose: t.compose, states: t.states, steps: t.steps, stepHelp: t.stepHelp, errors: t.errors }}
        />
      )}
    </main>
  );
}
