"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Teammate } from "./shared.ts";

// The filters of a list of companies or contacts: words, owner, tag (and
// for contacts, "no contact for 3 years"). They write the address, so the
// list can be bookmarked and exported as shown.
export function ListFilters({ label, tags, team, me, stale, t }: { label: string; tags: string[]; team: Teammate[]; me: string; stale?: boolean; t: Catalogue }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${path}${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => set("q", q.trim()), 300);
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
      <select id="f-owner" className="field compact" value={params.get("owner") ?? ""} onChange={e => set("owner", e.target.value)}>
        <option value="">{t.common.everyone}</option>
        <option value="me">{t.common.mine}</option>
        <option value="none">{t.common.unassigned}</option>
        {team.filter(p => p.id !== me).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {tags.length > 0 && (
        <>
          <label className="visually-hidden" htmlFor="f-tag">{t.common.tags}</label>
          <select id="f-tag" className="field compact" value={params.get("tag") ?? ""} onChange={e => set("tag", e.target.value)}>
            <option value="">{t.common.anyTag}</option>
            {tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </>
      )}
      {stale && (
        <label className="check-label" title={t.contacts.staleHint}>
          <input type="checkbox" checked={params.get("stale") === "1"} onChange={e => set("stale", e.target.checked ? "1" : "")} />
          {t.contacts.stale}
        </label>
      )}
    </div>
  );
}
