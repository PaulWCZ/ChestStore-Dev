"use client";

import { DateField, SearchBox } from "@argentic/chest-ui/components";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Sliders } from "../../../components/icons.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { FieldDef } from "../../../lib/custom.ts";
import { shownName } from "../../../lib/seed-words.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Teammate } from "./shared.ts";

// Writes the list's address: its filters live there, so a list can be
// bookmarked and exported as shown. Any change goes back to the first page.
export function useListAddress() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (values: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    next.delete("page");
    router.replace(`${path}${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  return { params, set };
}

// The filters of a list of companies or contacts: words, owner, tag, one of
// the team's own fields (and for contacts, "no contact for 3 years"), its
// order, and its exports. On a phone only the search shows, and one
// "Filters (n)" button opens the rest: the first row of the list stays near
// the top of the screen.
export function ListFilters({ label, tags, team, me, stale, sorts, fields, today, exports, t }: { label: string; tags: string[]; team: Teammate[]; me: string; stale?: boolean; sorts: { value: string; label: string }[]; fields: FieldDef[]; today: string; exports?: ReactNode; t: Catalogue }) {
  const { params, set } = useListAddress();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const panel = useId();
  const active = ["owner", "tag", "stale", "cf"].filter(k => (params.get(k) ?? "") !== "").length + ((params.get("sort") ?? "") !== "" ? 1 : 0);
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => set({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="filters" role="group" aria-label={t.common.filters}>
      {/* The kit's search box, filtering this list as one types (the
          header's box keeps the "/" key). */}
      <span className="filter-search">
        <SearchBox id="f-q" action="" value={q} shortcut={false} maxLength={100} placeholder={label} labels={{ ...t.searchBox, label }} onSearch={setQ} />
      </span>
      <button type="button" className="button quiet small filter-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <Sliders />{active > 0 ? format(t.common.filtersOn, { count: active }) : t.common.filters}
      </button>
      <div id={panel} className={open ? "filter-more open" : "filter-more"}>
      <label className="visually-hidden" htmlFor="f-owner">{t.common.owner}</label>
      <select id="f-owner" className="field compact" value={params.get("owner") ?? ""} onChange={e => set({ owner: e.target.value })}>
        <option value="">{t.common.everyone}</option>
        <option value="me">{t.common.mine}</option>
        <option value="none">{t.common.unassigned}</option>
        {team.filter(p => p.id !== me).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {tags.length > 0 && (
        <>
          <label className="visually-hidden" htmlFor="f-tag">{t.common.tags}</label>
          <select id="f-tag" className="field compact" value={params.get("tag") ?? ""} onChange={e => set({ tag: e.target.value })}>
            <option value="">{t.common.anyTag}</option>
            {tags.map(tag => <option key={tag} value={tag}>{shownName("tags", tag, t)}</option>)}
          </select>
        </>
      )}
      <FieldFilter fields={fields} today={today} t={t} />
      {stale && (
        <label className="check-label" title={t.contacts.staleHint}>
          <input type="checkbox" checked={params.get("stale") === "1"} onChange={e => set({ stale: e.target.checked ? "1" : "" })} />
          {t.contacts.stale}
        </label>
      )}
      <span className="sort">
        <label className="label-mono" htmlFor="f-sort">{t.common.sort}</label>
        <select id="f-sort" className="field compact" value={params.get("sort") ?? sorts[0]?.value ?? ""} onChange={e => set({ sort: e.target.value === sorts[0]?.value ? "" : e.target.value })}>
          {sorts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </span>
      {exports && <span className="exports">{exports}</span>}
      </div>
    </div>
  );
}

// One of the team's own fields as a filter: a choice among its choices,
// words of a text, a range of numbers or days (or simply "filled in").
export function FieldFilter({ fields, today, t }: { fields: FieldDef[]; today: string; t: Catalogue }) {
  const { params, set } = useListAddress();
  const chosen = fields.find(f => f.id === params.get("cf"));
  const [value, setValue] = useState(params.get("cv") ?? "");
  const w = t.common.fieldFilter;
  useEffect(() => {
    if (!chosen || chosen.kind !== "text" || value === (params.get("cv") ?? "")) return;
    const timer = setTimeout(() => set({ cv: value.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (fields.length === 0) return null;
  return (
    <span className="field-filter">
      <label className="visually-hidden" htmlFor="f-cf">{w.label}</label>
      <select id="f-cf" className="field compact" value={chosen?.id ?? ""} onChange={e => { setValue(""); set({ cf: e.target.value, cv: "", cmin: "", cmax: "" }); }}>
        <option value="">{w.none}</option>
        {fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      {chosen?.kind === "choice" && (
        <>
          <label className="visually-hidden" htmlFor="f-cv">{w.value}</label>
          <select id="f-cv" className="field compact" value={params.get("cv") ?? ""} onChange={e => set({ cv: e.target.value })}>
            <option value="">{w.filled}</option>
            {chosen.options.map((o, i) => <option key={o} value={o}>{chosen.optionLabels?.[i] ?? o}</option>)}
          </select>
        </>
      )}
      {chosen?.kind === "text" && (
        <>
          <label className="visually-hidden" htmlFor="f-cv">{w.value}</label>
          <input id="f-cv" className="field compact" value={value} onChange={e => setValue(e.target.value)} placeholder={w.value} maxLength={100} />
        </>
      )}
      {chosen?.kind === "number" && (
        <>
          <label className="visually-hidden" htmlFor="f-cmin">{w.min}</label>
          <input id="f-cmin" className="field compact range" type="text" inputMode="decimal"
            defaultValue={params.get("cmin") ?? ""} placeholder={w.min} onBlur={e => set({ cmin: e.target.value })} onKeyDown={e => { if (e.key === "Enter") set({ cmin: e.currentTarget.value }); }} />
          <label className="visually-hidden" htmlFor="f-cmax">{w.max}</label>
          <input id="f-cmax" className="field compact range" type="text" inputMode="decimal"
            defaultValue={params.get("cmax") ?? ""} placeholder={w.max} onBlur={e => set({ cmax: e.target.value })} onKeyDown={e => { if (e.key === "Enter") set({ cmax: e.currentTarget.value }); }} />
        </>
      )}
      {/* A range of days: the kit's DateField (typed in the reader's
          language, or picked), never the browser's date field. */}
      {chosen?.kind === "date" && (
        <span className="date-range">
          <DateField id="f-cmin" label={w.from} value={params.get("cmin") || null} onChange={day => set({ cmin: day ?? "" })} today={today} chips={false} labels={t.date} />
          <DateField id="f-cmax" label={w.to} value={params.get("cmax") || null} onChange={day => set({ cmax: day ?? "" })} today={today} chips={false} labels={t.date} />
        </span>
      )}
    </span>
  );
}
