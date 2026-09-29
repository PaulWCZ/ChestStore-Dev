"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ItemLine } from "../../../components/bits.tsx";
import { Download, Print, Search } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { statuses } from "../../../lib/model.ts";
import type { Row } from "../../../lib/view.ts";

type Words = { list: Catalogue["list"]; status: Catalogue["status"]; shell: Catalogue["shell"]; common: Catalogue["common"] };
type Option = { value: string; label: string };

const pageQuery = (query: string, page: number) => {
  const p = new URLSearchParams(query);
  if (page > 1) p.set("page", String(page)); else p.delete("page");
  return p.toString();
};

// The list and its filters: a plain GET form (it works without script),
// sent again as soon as a filter changes. A manager ticks items to print
// their labels, or prints those shown.
export function ItemsView({ rows, paging, manager, filtered, query, values, categories, holders, places, t, locale }: {
  rows: Row[]; paging: { page: number; pages: number; text: string } | null; manager: boolean; filtered: boolean; query: string;
  values: { q: string; category: string; status: string; holder: string; sort: string };
  categories: Option[]; holders: Option[]; places: string[]; t: Words; locale: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const submit = () => form.current?.requestSubmit();
  const toggle = (id: string) => setPicked(old => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const all = rows.length > 0 && rows.every(r => picked.has(r.id));
  const w = t.list;

  return (
    <div className="stack">
      <form ref={form} className="filters" method="get" action="/chest/items" role="search">
        <div className="filter-q">
          <label htmlFor="list-q" className="visually-hidden">{w.search}</label>
          <Search />
          <input id="list-q" name="q" type="search" className="field" defaultValue={values.q} placeholder={t.shell.search} maxLength={100} />
          <button type="submit" className="button quiet">{w.search}</button>
        </div>
        <div className="filter-selects">
          <label className="select-label">
            <span>{w.category}</span>
            <select name="category" className="field" defaultValue={values.category} onChange={submit}>
              <option value="">{w.any}</option>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="select-label">
            <span>{w.status}</span>
            <select name="status" className="field" defaultValue={values.status} onChange={submit}>
              <option value="">{w.any}</option>
              {statuses.map(s => <option key={s} value={s}>{t.status[s]}</option>)}
              <option value="low">{w.low}</option>
            </select>
          </label>
          <label className="select-label">
            <span>{w.holder}</span>
            <select name="holder" className="field" defaultValue={values.holder} onChange={submit}>
              <option value="">{w.anyone}</option>
              <option value="nobody">{w.nobody}</option>
              {holders.length > 0 && <optgroup label={w.team}>{holders.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}</optgroup>}
              {places.length > 0 && <optgroup label={w.places}>{places.map(p => <option key={p} value={"place:" + p}>{p}</option>)}</optgroup>}
            </select>
          </label>
          <label className="select-label">
            <span>{w.sort}</span>
            <select name="sort" className="field" defaultValue={values.sort} onChange={submit}>
              {(["tag", "name", "newest", "ending"] as const).map(s => <option key={s} value={s}>{w.sorts[s]}</option>)}
            </select>
          </label>
        </div>
        {filtered && <Link className="button link" href="/chest/items">{w.clear}</Link>}
      </form>

      {manager && rows.length > 0 && (
        <div className="bulk no-print">
          <label className="check">
            <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map(r => r.id)))} />
            <span>{picked.size > 0 ? plural(w.selected, picked.size, locale) : w.selectAll}</span>
          </label>
          <span className="bulk-actions">
            {picked.size > 0
              ? <Link className="button small" href={`/chest/labels?ids=${[...picked].join(",")}`}><Print />{w.printSelected}</Link>
              : <Link className="button small quiet" href={`/chest/labels?${query || "all=1"}`}><Print />{w.printAll}</Link>}
            <a className="button small quiet" href={`/chest/export${query ? "?" + query : ""}`} download><Download />{t.shell.export}</a>
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty"><p>{filtered ? w.empty : w.emptyAll}</p></div>
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
          {paging.page > 1 ? <Link className="button quiet small" href={`/chest/items?${pageQuery(query, paging.page - 1)}`}>{t.common.previous}</Link> : <span />}
          <span className="small muted">{paging.text}</span>
          {paging.page < paging.pages ? <Link className="button quiet small" href={`/chest/items?${pageQuery(query, paging.page + 1)}`}>{t.common.next}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
