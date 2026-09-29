"use client";

import { AppShell, Menu, SearchBox, type MenuItem } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Building, Chart, Download, Gear, Person, Pipeline, Today, Upload } from "./icons.tsx";

// The members' frame: the kit's AppShell (skip link, header, labelled
// sections — a row of their own under the header on a phone, never icons
// alone —, the member chip), with Next.js's Link and the current path; at
// the right of the header the client search ("/" focuses it from anywhere
// but a field) and, for managers, a "More" menu of rare acts (import,
// settings, export everything). Functions and icons are made here, in a
// client component: the server layout passes only plain data.
export type ShellWords = {
  myDay: string; deals: string; companies: string; contacts: string; team: string;
  more: string; import: string; settings: string; exportAll: string;
};

export function Shell({ brand, member, words, sections, more, search, labels, children }: {
  brand: ReactNode;
  member: { name: string; role: string | null; photo: string | null };
  words: ShellWords;
  // false: a role that gives nothing (no sections, no search).
  sections: boolean;
  more: { import: boolean; settings: boolean; exportAll: boolean };
  search: SearchWords;
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const nav = sections ? [
    { href: "/chest", label: words.myDay, icon: <Today />, match: "exact" as const },
    { href: "/chest/deals", label: words.deals, icon: <Pipeline /> },
    { href: "/chest/companies", label: words.companies, icon: <Building /> },
    { href: "/chest/contacts", label: words.contacts, icon: <Person /> },
    { href: "/chest/team", label: words.team, icon: <Chart /> },
  ] : [];
  const items: MenuItem[] = [
    ...(more.import ? [{ label: words.import, href: "/chest/import", icon: <Upload /> }] : []),
    ...(more.settings ? [{ label: words.settings, href: "/chest/settings", icon: <Gear /> }] : []),
    ...(more.exportAll ? [{ label: words.exportAll, href: "/chest/export/all", icon: <Download /> }] : []),
  ];
  return (
    <AppShell
      brand={brand}
      nav={nav}
      path={path}
      link={Link}
      member={member}
      tools={sections ? (
        <>
          <SearchBox action="/chest/search" labels={search} maxLength={100} />
          {items.length > 0 && <Menu label={words.more} items={items} />}
        </>
      ) : null}
      labels={labels}
      width="full"
    >
      {children}
    </AppShell>
  );
}
