"use client";

import { AppShell, SearchBox } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Pen } from "./icons.tsx";

// The members' frame: the kit's AppShell (skip link, header, member chip),
// with the search at the right of the header ("/" focuses it) and, for a
// publisher, "Write a post" — for everyone else, "Share something" (a post
// a publisher approves, app/chest/propose) — News has one page people read, so no
// sections: the front page's own section tabs filter it. The header's
// search is left out on the search page (which has its own), and the
// Write button inside the composer (where the only button that sends is
// the composer's own).
export function Shell({ brand, member, search, write, labels, children }: {
  brand: ReactNode;
  member: { name: string; role: string | null; photo: string | null };
  // null: a role that gives nothing (no search).
  search: SearchWords | null;
  // The header's button: "Write a post" (publishers) or "Share something"
  // (everyone else); null: a role that gives nothing.
  write: { label: string; href: string } | null;
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  // The page runs in the browser: its buttons answer (the browser flows
  // wait for this marker rather than for a time).
  useEffect(() => { document.documentElement.dataset["hydrated"] = ""; }, []);
  const composing = path === "/chest/new" || path === "/chest/propose" || /^\/chest\/posts\/[^/]+\/edit$/u.test(path);
  const tools = (
    <>
      {search && path !== "/chest/search" && <SearchBox id="top-search" action="/chest/search" labels={search} />}
      {write && !composing && <a className="button small write" href={write.href}><Pen /><span>{write.label}</span></a>}
    </>
  );
  return (
    <AppShell brand={brand} path={path} member={member} tools={tools} labels={labels} width="full">
      {children}
    </AppShell>
  );
}
