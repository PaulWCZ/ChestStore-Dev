"use client";

import { AppShell, type NavItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The members' part in the kit's shell: the sections as labelled tabs (in
// the header on a wide screen, a row of their own under it on a phone —
// never icons alone), the member chip at the right. Here only because the
// current path and Next's <Link> belong to the browser (ui/README.md
// "AppShell"). The header is the map's dark margin, with its contour lines
// (app/globals.css, "Shell").
export function Shell({ brand, nav, member, labels, children }: {
  brand: ReactNode;
  nav: NavItem[];
  member: { name: string; role: string | null; photo: string | null };
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  return (
    <AppShell brand={brand} nav={nav} path={path} link={Link} member={member} labels={labels} width="full">
      {children}
    </AppShell>
  );
}
