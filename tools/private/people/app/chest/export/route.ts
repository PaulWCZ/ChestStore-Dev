import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { directory } from "../../../lib/directory.ts";
import { directoryCsv } from "../../../lib/export.ts";
import { listFields } from "../../../lib/fields.ts";
import { catalogue, isLocale } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/zone.ts";
import { currentMember } from "../../../lib/session.ts";

// The directory as a CSV file, for HR, headers in their language.
export async function GET(): Promise<Response> {
  const actor = await currentMember();
  if (!actor) return new Response(null, { status: 401 });
  if (!can(actor, "directory.export")) return new Response(null, { status: 404 });
  const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
  const { ok, entries } = await directory(db(), actor);
  if (!ok) return new Response(t.errors.unavailable, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(directoryCsv(entries, t.exportColumns, await listFields(db(), actor)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.exportColumns.file}-${today()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
