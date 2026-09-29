"use client";

import { Filters, PeoplePicker, type FilterGroup } from "@argentic/chest-ui/components";
import { localSearch, type FilterWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Params = Readonly<Record<string, string | undefined>>;

// Filters kept in the address (the kit's chips: a filtered view is a link
// to share, Back works, and they work before any script): which cycle
// (always one), how it goes, which team. Here only because Next's <Link>
// belongs to the browser.
export function LinkFilters({ path, params, groups, labels }: { path: string; params: Params; groups: FilterGroup[]; labels: FilterWords }) {
  return <Filters path={path} params={params} groups={groups} link={Link} labels={labels} />;
}

// The owner: a person among those who own something in the cycle, typed
// by name (the kit's picker); choosing goes to the same view narrowed to
// them, letting go widens it again.
export function OwnerFilter({ path, params, owners, label, labels, lang }: { path: string; params: Params; owners: { id: string; name: string; photo: string | null }[]; label: string; labels: PeoplePickerWords; lang: string }) {
  const router = useRouter();
  const chosen = owners.filter(o => o.id === params.owner);
  const go = (owner: string | null) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "owner") q.set(k, v);
    if (owner) q.set("owner", owner);
    router.push(`${path}?${q.toString()}`);
  };
  return (
    <div className="owner-filter">
      <PeoplePicker label={label} value={chosen} onChange={v => go(v[0]?.id ?? null)} search={localSearch(owners)} suggestions={owners} suggestionsLabel={labels.suggested} labels={labels} lang={lang} />
    </div>
  );
}
