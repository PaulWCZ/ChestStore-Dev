"use client";

import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";

type Params = Readonly<Record<string, string | undefined>>;

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
