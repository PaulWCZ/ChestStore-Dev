"use client";

import { Filters, type FilterGroup } from "@argentic/chest-ui/components";
import type { FilterWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";

// The inbox's filters, in the kit's chips: a priority, a tag, the order.
// Each is a link (the address keeps it: Back and a shared link work), and
// Next.js's Link keeps the page (and the ticked tickets' bar) without a
// reload. On a phone each group is one line that slides sideways
// (phone="scroll"): the tickets stay near the top.
export function InboxFilters({ params, groups, labels }: { params: Record<string, string | undefined>; groups: FilterGroup[]; labels: FilterWords }) {
  return <Filters path="/chest" params={params} groups={groups} labels={labels} link={Link} phone="scroll" />;
}
