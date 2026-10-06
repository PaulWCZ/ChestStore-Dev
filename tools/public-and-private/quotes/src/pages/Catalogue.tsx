import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listItems } from "../lib/items.ts";

// The catalogue: what the company sells (an island: its dialog, Undo).
export async function cataloguePage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const archived = ctx.query("archived") === "1";
  const items = await listItems(db(), member, { archived });
  return {
    title: t.catalogue.title,
    body: <Island name="CatalogueView" props={{
      t: { catalogue: t.catalogue, list: t.list, kit: t.kit, errors: t.errors, common: t.common, units: Object.values(t.pdf.units).map(u => u.one) },
      locale: localeOf(ctx.locale), items, archived, canWrite: can(member, "catalogue.write"), currency: chest.currency,
    }} />,
  };
}
