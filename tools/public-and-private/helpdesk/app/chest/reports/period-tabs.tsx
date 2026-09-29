"use client";

import { Tabs, type TabItem } from "@argentic/chest-ui/components";
import Link from "next/link";

// The period of the reports, as the kit's link tabs (the address keeps it).
export function PeriodTabs({ label, items, current }: { label: string; items: TabItem[]; current: string }) {
  return <Tabs label={label} items={items} current={current} link={Link} />;
}
