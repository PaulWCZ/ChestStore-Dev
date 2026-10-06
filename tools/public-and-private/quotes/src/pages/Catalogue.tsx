import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Pager, pageOf, pageSize } from "../components/pager.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { countItems, listItems } from "../lib/items.ts";

// The catalogue: what the company sells (an island: its dialog, Undo), a
// page at a time.
export async function cataloguePage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const archived = ctx.query("archived") === "1";
  const locale = localeOf(ctx.locale);
  const sql = db();
  const count = await countItems(sql, { archived });
  const { page, pages, offset } = pageOf(ctx.query("page"), count);
  const items = await listItems(sql, member, { archived, limit: pageSize, offset });
  return {
    title: t.catalogue.title,
    body: (
      <>
        <Island name="CatalogueView" props={{
          t: { catalogue: t.catalogue, list: t.list, kit: t.kit, errors: t.errors, common: t.common, units: Object.values(t.pdf.units).map(u => u.one) },
          locale, items, archived, canWrite: can(member, "catalogue.write"), currency: chest.currency,
        }} />
        {pages > 1 && <div className="page pager-page">
          <Pager path="/chest/catalogue" params={archived ? { archived: "1" } : {}} page={page} pages={pages} shown={items.length} count={count} words={t.list} locale={locale} back={t.list.previous} next={t.list.next} />
        </div>}
      </>
    ),
  };
}
