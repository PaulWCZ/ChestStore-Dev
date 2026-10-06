"use client";

import { AppShell, type NavItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Clock, External, Gear, Pulse, Radar, Stack } from "./icons.tsx";

// The team's frame: the kit's AppShell (skip link, header, labelled
// sections — a row of their own under the header on a phone, never icons
// alone —, the member chip), with Next.js's Link and the current path. Five
// sections: an incident or a maintenance is part of "Now" (where it is
// posted from), the subscribers of "Settings" (where the page is set up).
// At the right, the public page, as customers see it, in a new tab.
export type ShellWords = { now: string; history: string; components: string; checks: string; settings: string; publicPage: string };

export function Shell({ brand, words, sections, publicHome, member, labels, children }: {
  brand: ReactNode;
  words: ShellWords;
  // false: a member without a role (the team's read-only status page).
  sections: boolean;
  publicHome: string;
  member: { name: string; role: string | null; photo: string | null };
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const nav: NavItem[] = sections ? [
    { href: "/chest", label: words.now, icon: <Pulse />, also: ["/chest/incidents", "/chest/maintenance"] },
    { href: "/chest/history", label: words.history, icon: <Clock /> },
    { href: "/chest/components", label: words.components, icon: <Stack /> },
    { href: "/chest/checks", label: words.checks, icon: <Radar /> },
    { href: "/chest/settings", label: words.settings, icon: <Gear />, also: ["/chest/subscribers"] },
  ] : [];
  return (
    <AppShell
      brand={brand}
      nav={nav}
      path={path}
      link={Link}
      member={member}
      tools={sections ? <a className="public-link" href={publicHome} target="_blank" rel="noopener">{words.publicPage}<External /></a> : null}
      labels={labels}
      width="normal"
    >
      {children}
    </AppShell>
  );
}
