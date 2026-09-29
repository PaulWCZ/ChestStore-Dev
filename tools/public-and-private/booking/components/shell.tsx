"use client";

import { AppShell, type NavItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Calendar, Clock, Gear, Stack } from "./icons.tsx";

type Section = "bookings" | "types" | "hours" | "settings";
const icons: Record<Section, () => ReactNode> = { bookings: Calendar, types: Stack, hours: Clock, settings: Gear };
const hrefs: Record<Section, string> = { bookings: "/chest", types: "/chest/types", hours: "/chest/hours", settings: "/chest/settings" };

// The members' frame: the kit's AppShell (labelled tabs, on a phone in a
// row of their own; the member chip), with Next.js's links and the path.
// "Bookings" is also the current tab on a booking's page and on "New
// booking" (the kit marks /chest current on /chest alone).
export function Shell({ brand, sections, labels, member, children }: {
  brand: ReactNode;
  sections: { id: Section; label: string }[];
  labels: { skip: string; nav: string };
  member: { name: string; role: string | null; photo: string | null } | null;
  children: ReactNode;
}) {
  const path = usePathname();
  const shown = path.startsWith("/chest/bookings/") || path === "/chest/new" ? "/chest" : path;
  const nav: NavItem[] = sections.map(s => ({ href: hrefs[s.id], label: s.label, icon: icons[s.id]() }));
  return (
    <AppShell brand={brand} nav={nav} path={shown} link={Link} member={member} labels={labels}>
      {children}
    </AppShell>
  );
}
