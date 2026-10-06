import { chest } from "@argentic/chest-sdk/chest";
import { Island, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { format, formatDate, localeOf } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { pastInventories, progress, shown } from "../lib/inventory.ts";
import { nameOf, people } from "../lib/people.ts";
import { holderIds, rowOf } from "../lib/view.ts";

// The inventory (managers): start one; while it runs, scan or type tags,
// tick what one sees, see what is left; close it. Past inventories and what
// each one missed.
export async function inventoryPage({ member, locale: language, t, f, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [now, past] = await Promise.all([progress(sql, member, { q: query("q") ?? "", page: Number.parseInt(query("page") ?? "1", 10) || 1 }), pastInventories(sql, member)]);
  const zone = f.timeZone;
  const today = chest.today();
  const names = await people([...(now ? [now.inventory.startedBy, ...holderIds([...now.seen, ...now.notSeen])] : [])]);
  const date = (d: string) => formatDate(d, locale, { day: "numeric", month: "long", year: "numeric" }, zone);
  return { title: t.inventory.title, body: (
    <div className="wide">
      <PageHeader size="m" title={t.inventory.title} intro={now ? format(t.inventory.started, { date: date(now.inventory.startedAt), name: nameOf(names.get(now.inventory.startedBy), locale) }) : undefined} />
      <Island id="inventory" name="InventoryView" props={{
        open: now !== null,
        counts: now ? { total: now.total, seen: now.seenCount, notSeen: now.notSeenCount, page: now.page, pages: now.pages, size: shown.notSeen, q: (query("q") ?? "").trim().slice(0, 100) } : { total: 0, seen: 0, notSeen: 0, page: 1, pages: 1, size: shown.notSeen, q: "" },
        seen: (now?.seen ?? []).map(i => rowOf(i, names, t, locale, today, member.id)),
        notSeen: (now?.notSeen ?? []).map(i => rowOf(i, names, t, locale, today, member.id)),
        t: { inventory: t.inventory, common: t.common, search: t.search },
        locale,
      }} />
      <section aria-labelledby="past">
        <h2 id="past" className="section-title">{t.inventory.past}</h2>
        {past.length === 0 ? <p className="muted">{t.inventory.none}</p> : (
          <ul className="plain">
            {past.map(p => (
              <li key={p.id} className="mini">
                <a className="mini-link" href={`/chest/inventory/${p.id}`}>
                  <span className="mini-what"><span className="strong">{format(t.inventory.pastLine, { date: date(p.closedAt!), seen: p.seen ?? 0, total: p.total ?? 0 })}</span></span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  ) };
}
