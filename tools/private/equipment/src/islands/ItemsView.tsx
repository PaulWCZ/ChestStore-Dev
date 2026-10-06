import { EmptyState, Filters, SearchBox } from "@argentic/chest-ui/components";
import { useState } from "react";
import { ItemLine } from "../components/bits.tsx";
import { Download, Plus, Print } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../i18n/format.ts";
import { statuses } from "../shared/model.ts";
import type { Row } from "../lib/view.ts";

type Words = { list: Catalogue["list"]; status: Catalogue["status"]; common: Catalogue["common"]; overview: Catalogue["overview"]; shell: Catalogue["shell"]; filters: Catalogue["filters"]; search: Catalogue["search"] };
type Option = { value: string; label: string };

const pageQuery = (query: string, page: number) => {
  const p = new URLSearchParams(query);
  if (page > 1) p.set("page", String(page)); else p.delete("page");
  return p.toString();
};

// The list, its search and its filters — all in the address (a filtered
// list is a link one can share, Back works, and it works without script):
// the kit's search box and filter chips (status, category, sort); who holds
// it, a list of the team and the places, in a small form of its own. A
// manager ticks items to print their labels, or prints those shown.
export function ItemsView({ rows, paging, manager, filtered, query, values, categories, holders, places, t, locale }: {
  rows: Row[]; paging: { page: number; pages: number; text: string } | null; manager: boolean; filtered: boolean; query: string;
  values: { q: string; category: string; status: string; holder: string; sort: string };
  categories: Option[]; holders: Option[]; places: string[]; t: Words; locale: string;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setPicked(old => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const all = rows.length > 0 && rows.every(r => picked.has(r.id));
  const w = t.list;
  // What the address says now (the chips and the forms keep the rest).
  const params: Record<string, string> = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));

  return (
    <div className="stack">
      <div className="filters">
        <div className="filter-q">
          <SearchBox action="/chest/items" value={values.q} keep={{ category: values.category, status: values.status, holder: values.holder, sort: values.sort === "tag" ? "" : values.sort }}
            shortcut={false} maxLength={100} labels={{ ...t.search, label: w.search }} />
        </div>
        <Filters path="/chest/items" params={params} labels={t.filters} groups={[
          { key: "status", label: w.status, all: true, options: [...statuses.map(s => ({ value: s, label: t.status[s] })), { value: "low", label: w.low }] },
          // Many categories (a big company's 30): a list to choose from.
          { key: "category", label: w.category, all: true, options: categories, ...(categories.length > 8 ? { as: "select" as const } : {}) },
          { key: "sort", label: w.sort, required: true, value: "tag", options: (["tag", "name", "newest", "ending"] as const).map(s => ({ value: s, label: w.sorts[s] })) },
        ]} />
        <form className="holder-filter" method="get" action="/chest/items">
          {(["q", "category", "status", "sort"] as const).map(k => values[k] && !(k === "sort" && values[k] === "tag") ? <input key={k} type="hidden" name={k} value={values[k]} /> : null)}
          <label className="ck-filter-label" htmlFor="list-holder">{w.holder}</label>
          <select id="list-holder" name="holder" className="field" defaultValue={values.holder} onChange={e => e.currentTarget.form?.requestSubmit()}>
            <option value="">{w.anyone}</option>
            <option value="nobody">{w.nobody}</option>
            {holders.length > 0 && <optgroup label={w.team}>{holders.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}</optgroup>}
            {places.length > 0 && <optgroup label={w.places}>{places.map(p => <option key={p} value={"place:" + p}>{p}</option>)}</optgroup>}
          </select>
        </form>
      </div>

      {manager && rows.length > 0 && (
        <div className="bulk no-print">
          <label className="check">
            <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map(r => r.id)))} />
            <span>{picked.size > 0 ? plural(w.selected, picked.size, locale) : w.selectAll}</span>
          </label>
          <span className="bulk-actions">
            {picked.size > 0
              ? <a className="button small" href={`/chest/labels?ids=${[...picked].join(",")}`}><Print />{w.printSelected}</a>
              : <a className="button small quiet" href={`/chest/labels?${query || "all=1"}`}><Print />{w.printAll}</a>}
            <a className="button small quiet" href={`/chest/export${query ? "?" + query : ""}`} download><Download />{t.shell.export}</a>
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title={filtered ? w.empty : w.emptyAll} action={manager && !filtered ? <a className="button" href="/chest/items/new"><Plus />{t.overview.add}</a> : undefined} />
      ) : (
        <ul className="lines">
          {rows.map(r => (
            <ItemLine key={r.id} row={r} lead={manager ? (
              <label className="line-pick">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="visually-hidden">{format(w.select, { tag: r.tag })}</span>
              </label>
            ) : undefined} />
          ))}
        </ul>
      )}
      {paging && (
        <nav className="pager" aria-label={w.pages}>
          {paging.page > 1 ? <a className="button quiet small" href={`/chest/items?${pageQuery(query, paging.page - 1)}`}>{t.common.previous}</a> : <span />}
          <span className="small muted">{paging.text}</span>
          {paging.page < paging.pages ? <a className="button quiet small" href={`/chest/items?${pageQuery(query, paging.page + 1)}`}>{t.common.next}</a> : <span />}
        </nav>
      )}
    </div>
  );
}
