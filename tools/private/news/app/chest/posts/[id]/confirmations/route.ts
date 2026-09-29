import { everyone, tally } from "../../../../../lib/audience.ts";
import { toCsv } from "../../../../../lib/csv.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { catalogue, intl, isLocale } from "../../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { confirmations } from "../../../../../lib/posts.ts";
import { currentMember } from "../../../../../lib/session.ts";
import { chestZone } from "../../../../../lib/zone.ts";

// Who confirmed an Important post, as a spreadsheet: its publishers only,
// in their language. Those who have not confirmed yet are listed too; a
// confirmation of an earlier version of the text says which.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const list = await confirmations(db(), actor, id);
    const locale = isLocale(actor?.locale) ? actor!.locale : "en";
    const t = catalogue(locale);
    const { confirmed, pending } = tally(list.post, list.confirmed, (await everyone()).people);
    const who = await people(confirmed.map(c => c.member));
    const when = new Intl.DateTimeFormat(intl(locale), { dateStyle: "short", timeStyle: "short", timeZone: chestZone() });
    const earlier = new Map(list.earlier.map(e => [e.member, e]));
    const rows: unknown[][] = [
      [t.csv.person, t.csv.status, t.csv.at, t.csv.version],
      ...confirmed.map(c => [nameOf(who.get(c.member), locale), t.csv.confirmed, when.format(new Date(c.at)), c.version]),
      ...pending.map(p => {
        const before = earlier.get(p.id);
        return before ? [p.name, t.csv.earlier, when.format(new Date(before.at)), before.version] : [p.name, t.csv.pending, "", ""];
      }),
    ];
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${t.csv.file}-${list.post.id}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
