"use client";

import { AppShell, type NavItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The members' part in the kit's shell: the sections as labelled tabs (a
// row of their own under the header on a phone, never icons alone), the
// member chip at the right. Here only because the current path and Next's
// <Link> are functions of the browser (ui/README.md "AppShell"). The pages
// set their own width (.page, .page.narrow, .page.wide).
export function Shell({ brand, nav, member, labels, children }: {
  brand: ReactNode;
  nav: NavItem[];
  member: { name: string; role: string | null; photo: string | null };
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  return (
    <AppShell brand={brand} nav={nav} path={path} link={props => <Link {...props} />} member={member} labels={labels} width="full">
      {children}
    </AppShell>
  );
}
