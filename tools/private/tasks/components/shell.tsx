"use client";

import { AppShell, SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Grid, Home } from "./icons.tsx";

// The members' frame: the kit's AppShell (skip link, header, labelled
// sections — a row of their own on a phone —, the member chip), with
// Next.js's Link as it is and the current path, and the card search at the right
// of the header ("/" focuses it). Functions and icons are made here, in a
// client component: a server layout passes only plain data.
export function Shell({ brand, member, nav, search, labels, children }: {
  brand: ReactNode;
  member: { name: string; role: string | null; photo: string | null };
  // null: a role that gives nothing (no sections, no search).
  nav: { myTasks: string; boards: string } | null;
  search: SearchWords;
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const items = nav ? [
    { href: "/chest", label: nav.myTasks, icon: <Home />, exact: true },
    { href: "/chest/boards", label: nav.boards, icon: <Grid /> },
  ] : [];
  return (
    <AppShell
      brand={brand}
      nav={items}
      path={path}
      link={Link}
      member={member}
      tools={nav ? <SearchBox action="/chest/search" labels={search} /> : null}
      labels={labels}
      width="full"
    >
      {children}
    </AppShell>
  );
}
