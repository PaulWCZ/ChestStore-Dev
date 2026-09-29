import { can } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { catalogue, isLocale } from "../../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { register, registerCsv } from "../../../../../lib/register.ts";
import { currentMember } from "../../../../../lib/session.ts";
import { today } from "../../../../../lib/zone.ts";

// The staff register as a CSV file, for HR, headers in their language;
// each download is written in the journal.
export async function GET(): Promise<Response> {
  const actor = await currentMember();
  if (!actor) return new Response(null, { status: 401 });
  if (!can(actor, "records.manage")) return new Response(null, { status: 404 });
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const t = catalogue(locale);
  const r = await register(db(), actor, "register_exported");
  const tutors = await people(r.interns.flatMap(l => (l.tutorId ? [l.tutorId] : [])));
  const words = { ...t.register.columns, sexes: t.record.sexes, mention: t.register.mention };
  return new Response(registerCsv(r, words, id => (id ? nameOf(tutors.get(id), locale) : "")), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.register.file}-${today()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
