import * as chest from "@argentic/chest-sdk/chest";
import { allComponents } from "../../../../lib/components.ts";
import { db } from "../../../../lib/db.ts";
import { format, zoneName } from "../../../../lib/i18n/index.ts";
import { otherLanguage } from "../../../../lib/languages.ts";
import { pickerGroups } from "../../../../lib/picker.ts";
import { viewer } from "../../../../lib/session.ts";
import { addDays } from "../../../../lib/zone.ts";
import { MaintenanceForm } from "./maintenance-form.tsx";

// Plan a maintenance: tomorrow evening by default, an hour long.
export default async function NewMaintenance() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  const zone = chest.timeZone();
  const groups = pickerGroups(await allComponents(db()));
  const tomorrow = addDays(chest.today(), 1);
  return (
    <main className="narrow stack-l">
      <h1>{t.maintenance.newTitle}</h1>
      {groups.length === 0 ? (
        <div className="empty">
          <p>{t.compose.noComponents}</p>
          <a className="button" href="/chest/components">{t.overview.setupAction}</a>
        </div>
      ) : (
        <MaintenanceForm
          groups={groups}
          start={{ day: tomorrow, minutes: 22 * 60 }}
          end={{ day: tomorrow, minutes: 23 * 60 }}
          zoneNote={format(t.maintenance.zone, { zone: zoneName(zone) })}
          languages={{ second: otherLanguage(), secondName: (t.languages as Record<string, string>)[otherLanguage()] ?? otherLanguage() }}
          t={{ maintenance: t.maintenance, compose: t.compose, errors: t.errors }}
        />
      )}
    </main>
  );
}
