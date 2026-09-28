import * as chest from "@argentic/chest-sdk/chest";
import { can } from "../../../lib/access.ts";
import { toCsv } from "../../../lib/csv.ts";
import { db } from "../../../lib/db.ts";
import { exportRows } from "../../../lib/export.ts";
import { catalogue, isLocale } from "../../../lib/i18n/index.ts";
import { listItems, sorts } from "../../../lib/items.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { currentMember } from "../../../lib/session.ts";
import { holderIds } from "../../../lib/view.ts";

// The equipment as CSV (managers), in their language, with the filters of
// the list. The file reads back into the importer.
export async function GET(request: Request): Promise<Response> {
  const actor = await currentMember();
  if (!actor || !can(actor, "items.manage")) return new Response(null, { status: 403 });
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const t = catalogue(locale);
  const p = new URL(request.url).searchParams;
  const sort = p.get("sort") ?? "tag";
  const items = await listItems(db(), actor, { q: p.get("q") ?? "", category: p.get("category") ?? "", status: p.get("status") ?? "", holder: p.get("holder") ?? "", sort: sorts.includes(sort as never) ? sort : "tag" }, 20000);
  const names = await people(holderIds(items));
  const body = toCsv(exportRows(items, t, chest.currency(), id => (id === "erased" ? t.people.erased : nameOf(names.get(id), locale))));
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.export.filename}-${chest.today()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
