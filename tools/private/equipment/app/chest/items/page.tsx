import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { listCategories } from "../../../lib/categories.ts";
import { db } from "../../../lib/db.ts";
import { plural } from "../../../lib/i18n/index.ts";
import { holderCounts, listItems, places, sorts, type Filters } from "../../../lib/items.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { holderIds, rowOf } from "../../../lib/view.ts";
import { categoryName } from "../../../lib/words.ts";
import { ItemsView } from "./items-view.tsx";

const max = 500;

// The catalogue: search (a tag, a serial number, a model, a person), filters
// by category, status and holder, sort. A tag typed exactly opens its item
// (what a scanner types). Managers pick items to print their labels.
export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const filters: Filters = { q: one("q"), category: one("category"), status: one("status"), holder: one("holder"), sort: sorts.includes(one("sort") as never) ? one("sort") : "tag" };
  const manager = can(member, "items.manage");
  const sql = db();
  const found = await listItems(sql, member, filters, max + 1);
  const q = filters.q?.trim() ?? "";
  if (q && !filters.category && !filters.status && !filters.holder) {
    const exact = found.filter(i => i.tag.toLowerCase() === q.toLowerCase());
    if (exact.length === 1) redirect(`/chest/items/${exact[0]!.id}`);
  }
  const shown = found.slice(0, max);
  const [categories, placeList, holders] = await Promise.all([listCategories(sql, member), places(sql, member), manager ? holderCounts(sql, member) : Promise.resolve(new Map())]);
  const names = await people([...holderIds(shown), ...holders.keys()]);
  const today = chest.today();
  const rows = shown.map(i => rowOf(i, names, t, locale, today, member.id));
  const holderOptions = [...holders.keys()]
    .map(id => ({ value: id, label: id === "erased" ? t.people.erased : nameOf(names.get(id), locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const filtered = Boolean(q || filters.category || filters.status || filters.holder);
  const query = new URLSearchParams(Object.entries({ q, category: filters.category ?? "", status: filters.status ?? "", holder: filters.holder ?? "", sort: filters.sort ?? "" }).filter(([, value]) => value !== "")).toString();

  return (
    <main className="wide">
      <div className="page-head">
        <div>
          <h1>{t.list.title}</h1>
          <p className="muted" aria-live="polite">{plural(t.list.count, shown.length, locale)}</p>
        </div>
        {manager && <div className="actions"><Link className="button" href="/chest/items/new"><Plus />{t.overview.add}</Link></div>}
      </div>
      <ItemsView
        rows={rows}
        capped={found.length > max ? max : 0}
        manager={manager}
        filtered={filtered}
        query={query}
        values={{ q, category: filters.category ?? "", status: filters.status ?? "", holder: filters.holder ?? "", sort: filters.sort ?? "tag" }}
        categories={categories.map(c => ({ value: c.id, label: categoryName(c, t) }))}
        holders={holderOptions}
        places={placeList}
        t={{ list: t.list, status: t.status, shell: t.shell }}
        locale={locale}
      />
    </main>
  );
}
