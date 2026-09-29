"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Catalogue } from "../lib/i18n/index.ts";
import { defaultSort, priorities, sorts } from "../lib/model.ts";

// The inbox's filters: a priority, a tag, the order. Each choice shows at
// once (the address keeps it, so Back and a shared link work).
export function InboxFilters({ tags, t }: { tags: { id: string; name: string }[]; t: { inbox: Catalogue["inbox"]; priority: Catalogue["priority"] } }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const w = t.inbox;
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${path}?${next.toString()}`);
  };
  const active = ["priority", "tag", "sort"].some(k => params.get(k));
  const clear = new URLSearchParams(params.toString());
  for (const k of ["priority", "tag", "sort"]) clear.delete(k);
  return (
    <div className="filters" role="group" aria-label={w.filters}>
      <label className="filter"><span className="visually-hidden">{w.priorityFilter}</span>
        <select className="select" value={params.get("priority") ?? ""} onChange={e => set("priority", e.target.value)}>
          <option value="">{w.anyPriority}</option>
          {[...priorities].reverse().map(p => <option key={p} value={p}>{t.priority[p]}</option>)}
        </select>
      </label>
      {tags.length > 0 && (
        <label className="filter"><span className="visually-hidden">{w.tagFilter}</span>
          <select className="select" value={params.get("tag") ?? ""} onChange={e => set("tag", e.target.value)}>
            <option value="">{w.anyTag}</option>
            {tags.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label className="filter"><span className="visually-hidden">{w.sortBy}</span>
        <select className="select" value={params.get("sort") ?? defaultSort} onChange={e => set("sort", e.target.value === defaultSort ? "" : e.target.value)}>
          {sorts.map(s => <option key={s} value={s}>{w.sorts[s]}</option>)}
        </select>
      </label>
      {active && <Link className="link-button" href={`${path}?${clear.toString()}`}>{w.showAll}</Link>}
    </div>
  );
}
