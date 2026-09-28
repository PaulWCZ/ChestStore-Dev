"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// A link of the side column that says when it is the page shown: a folder
// of the inbox (match: its name; the inbox without one is "unassigned"),
// or a page.
export function NavLink({ href, match, children }: { href: string; match?: string; children: ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const current = match
    ? path === "/chest" && !params.get("q") && (params.get("folder") ?? "unassigned") === match
    : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
