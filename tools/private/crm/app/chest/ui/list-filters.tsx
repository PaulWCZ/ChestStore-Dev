"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "../../../components/icons.tsx";
import type { FieldDef } from "../../../lib/custom.ts";
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
// the team's own fields (and for contacts, "no contact for 3 years"), and
// its order.
export function ListFilters({ label, tags, team, me, stale, sorts, fields, t }: { label: string; tags: string[]; team: Teammate[]; me: string; stale?: boolean; sorts: { value: string; label: string }[]; fields: FieldDef[]; t: Catalogue }) {
  const { params, set } = useListAddress();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => set({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="filters" role="search">
      <span className="filter-search">
        <Search />
        <label className="visually-hidden" htmlFor="f-q">{label}</label>
        <input id="f-q" className="field compact" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={label} maxLength={100} />
      </span>
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
            {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </>
      )}
      <FieldFilter fields={fields} t={t} />
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
    </div>
  );
}

// One of the team's own fields as a filter: a choice among its choices,
// words of a text, a range of numbers or days (or simply "filled in").
export function FieldFilter({ fields, t }: { fields: FieldDef[]; t: Catalogue }) {
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
            {chosen.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </>
      )}
      {chosen?.kind === "text" && (
        <>
          <label className="visually-hidden" htmlFor="f-cv">{w.value}</label>
          <input id="f-cv" className="field compact" value={value} onChange={e => setValue(e.target.value)} placeholder={w.value} maxLength={100} />
        </>
      )}
      {(chosen?.kind === "number" || chosen?.kind === "date") && (
        <>
          <label className="visually-hidden" htmlFor="f-cmin">{chosen.kind === "date" ? w.from : w.min}</label>
          <input id="f-cmin" className="field compact range" type={chosen.kind === "date" ? "date" : "text"} inputMode={chosen.kind === "number" ? "decimal" : undefined}
            defaultValue={params.get("cmin") ?? ""} placeholder={chosen.kind === "date" ? undefined : w.min} onBlur={e => set({ cmin: e.target.value })} onKeyDown={e => { if (e.key === "Enter") set({ cmin: e.currentTarget.value }); }} />
          <label className="visually-hidden" htmlFor="f-cmax">{chosen.kind === "date" ? w.to : w.max}</label>
          <input id="f-cmax" className="field compact range" type={chosen.kind === "date" ? "date" : "text"} inputMode={chosen.kind === "number" ? "decimal" : undefined}
            defaultValue={params.get("cmax") ?? ""} placeholder={chosen.kind === "date" ? undefined : w.max} onBlur={e => set({ cmax: e.target.value })} onKeyDown={e => { if (e.key === "Enter") set({ cmax: e.currentTarget.value }); }} />
        </>
      )}
    </span>
  );
}
