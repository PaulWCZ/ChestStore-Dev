import { chest } from "@argentic/chest-sdk/chest";
import { PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { listCategories } from "../../../lib/categories.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { countItems, holderCounts, listItems, places, sorts, type Filters } from "../../../lib/items.ts";
import { limits } from "../../../lib/model.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { holderIds, rowOf } from "../../../lib/view.ts";
import { categoryName } from "../../../lib/words.ts";
import { ItemsView } from "./items-view.tsx";

// The catalogue: search (a tag, a serial number, a model, a field's value,
// a person), filters by category, status and holder, sort; 100 a page. A
// tag typed exactly opens its item (what a scanner types). Managers pick
// items to print their labels.
export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const filters: Filters = { q: one("q"), category: one("category"), status: one("status"), holder: one("holder"), sort: sorts.includes(one("sort") as never) ? one("sort") : "tag" };
  const manager = can(member, "items.manage");
  const sql = db();
  const size = limits.page;
  const total = await countItems(sql, member, filters);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number.parseInt(one("page"), 10) || 1), pages);
  const shown = await listItems(sql, member, filters, size, (page - 1) * size);
  const q = filters.q?.trim() ?? "";
  if (q && !filters.category && !filters.status && !filters.holder && page === 1) {
    const exact = shown.filter(i => i.tag.toLowerCase() === q.toLowerCase());
    if (exact.length === 1) redirect(`/chest/items/${exact[0]!.id}`);
  }
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
    <div className="wide">
      <PageHeader size="m" title={t.list.title} intro={plural(t.list.count, total, locale)}
        action={manager ? <Link className="button" href="/chest/items/new"><Plus />{t.overview.add}</Link> : undefined} />
      <ItemsView
        rows={rows}
        paging={pages > 1 ? { page, pages, text: format(t.list.page, { from: (page - 1) * size + 1, to: (page - 1) * size + shown.length, total }) } : null}
        manager={manager}
        filtered={filtered}
        query={query}
        values={{ q, category: filters.category ?? "", status: filters.status ?? "", holder: filters.holder ?? "", sort: filters.sort ?? "tag" }}
        categories={categories.map(c => ({ value: c.id, label: categoryName(c, t) }))}
        holders={holderOptions}
        places={placeList}
        t={{ list: t.list, status: t.status, shell: t.shell, common: t.common, overview: t.overview, filters: t.filters, search: t.search }}
        locale={locale}
      />
    </div>
  );
}
