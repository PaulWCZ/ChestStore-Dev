"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FieldDef } from "../../../lib/custom.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { FieldFilter } from "../ui/list-filters.tsx";
import type { Choice, Teammate } from "../ui/shared.ts";

// The deals' filters: they write the address, so a filtered list can be
// bookmarked, shared, and exported as it is shown.
export function Filters({ view, owner, stage, closing, status, team, me, stages, fields, t }: { view: "board" | "list"; owner: string; stage: string; closing: string; status: string; team: Teammate[]; me: string; stages: Choice[]; fields: FieldDef[]; t: Catalogue }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.replace(`${path}${next.size ? "?" + next.toString() : ""}`, { scroll: false });
  };
  return (
    <div className="filters" role="group" aria-label={t.deals.filterOwner}>
      <label className="visually-hidden" htmlFor="f-owner">{t.deals.filterOwner}</label>
      <select id="f-owner" className="field compact" value={owner} onChange={e => set("owner", e.target.value)}>
        <option value="">{t.common.everyone}</option>
        <option value="me">{t.common.mine}</option>
        <option value="none">{t.common.unassigned}</option>
        {team.filter(p => p.id !== me).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {view === "list" && (
        <>
          <label className="visually-hidden" htmlFor="f-status">{t.deals.listStage}</label>
          <select id="f-status" className="field compact" value={status} onChange={e => set("status", e.target.value)}>
            <option value="">{t.deals.status.open}</option>
            <option value="won">{t.deals.status.won}</option>
            <option value="lost">{t.deals.status.lost}</option>
            <option value="any">{t.deals.status.any}</option>
          </select>
          <label className="visually-hidden" htmlFor="f-stage">{t.deals.filterStage}</label>
          <select id="f-stage" className="field compact" value={stage} onChange={e => set("stage", e.target.value)}>
            <option value="">{t.deals.anyStage}</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="check-label">
            <input type="checkbox" checked={closing === "month"} onChange={e => set("closing", e.target.checked ? "month" : "")} />
            {t.deals.closing}
          </label>
          <FieldFilter fields={fields} t={t} />
        </>
      )}
    </div>
  );
}
