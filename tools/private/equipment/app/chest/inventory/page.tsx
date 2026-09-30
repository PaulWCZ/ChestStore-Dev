import { chest } from "@argentic/chest-sdk/chest";
import { PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate } from "../../../lib/i18n/index.ts";
import { pastInventories, progress } from "../../../lib/inventory.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { holderIds, rowOf } from "../../../lib/view.ts";
import { InventoryView } from "./inventory-view.tsx";

// The inventory (managers): start one; while it runs, scan or type tags,
// tick what one sees, see what is left; close it. Past inventories and what
// each one missed.
export default async function InventoryPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const sql = db();
  const [now, past] = await Promise.all([progress(sql, member), pastInventories(sql, member)]);
  const zone = chest.timeZone;
  const today = chest.today();
  const names = await people([...(now ? [now.inventory.startedBy, ...holderIds([...now.seen, ...now.notSeen])] : [])]);
  const date = (d: string) => formatDate(d, locale, { day: "numeric", month: "long", year: "numeric" }, zone);
  return (
    <div className="wide">
      <PageHeader size="m" title={t.inventory.title} intro={now ? format(t.inventory.started, { date: date(now.inventory.startedAt), name: nameOf(names.get(now.inventory.startedBy), locale) }) : undefined} />
      <InventoryView
        open={now !== null}
        seen={(now?.seen ?? []).map(i => rowOf(i, names, t, locale, today, member.id))}
        notSeen={(now?.notSeen ?? []).map(i => rowOf(i, names, t, locale, today, member.id))}
        t={{ inventory: t.inventory, errors: t.errors, common: t.common }}
        locale={locale}
      />
      <section aria-labelledby="past">
        <h2 id="past" className="section-title">{t.inventory.past}</h2>
        {past.length === 0 ? <p className="muted">{t.inventory.none}</p> : (
          <ul className="plain">
            {past.map(p => (
              <li key={p.id} className="mini">
                <Link className="mini-link" href={`/chest/inventory/${p.id}`}>
                  <span className="mini-what"><span className="strong">{format(t.inventory.pastLine, { date: date(p.closedAt!), seen: p.seen ?? 0, total: p.total ?? 0 })}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
