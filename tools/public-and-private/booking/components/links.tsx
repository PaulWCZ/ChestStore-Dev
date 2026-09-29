"use client";

import { Tabs, type LinkComponent, type TabItem } from "@argentic/chest-ui/components";
import Link from "next/link";

// Next.js's Link as the kit's link type. The kit types a link as a
// function returning a ReactElement; Next's Link is a forwardRef component
// (it returns a ReactNode), so TypeScript needs this cast — reported in
// the migration notes (a kit gap). Behaviour is the same.
export const NextLink = Link as unknown as LinkComponent;

// The kit's link tabs, with Next.js's links (a server page cannot pass a
// component to a client one; this small wrapper does).
export function LinkTabs({ items, current, label }: { items: TabItem[]; current: string; label: string }) {
  return <Tabs items={items} current={current} label={label} link={NextLink} />;
}
