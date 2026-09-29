"use client";

import { Tabs, type TabItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";

// The period of the reports, as the kit's link tabs (the address keeps it)
// on a wide screen, and as one choice on a phone ("Last 8 weeks ▾"), where
// four long tabs would not fit.
export function PeriodTabs({ label, items, current }: { label: string; items: TabItem[]; current: string }) {
  const router = useRouter();
  return (
    <>
      <div className="period-tabs"><Tabs label={label} items={items} current={current} link={Link} /></div>
      <div className="period-select">
        <label className="visually-hidden" htmlFor="period">{label}</label>
        <select id="period" className="field" value={current} onChange={e => { const to = items.find(i => i.id === e.target.value); if (to?.href) router.push(to.href); }}>
          {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>
    </>
  );
}
