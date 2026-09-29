"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

// A link of the side column that says when it is the page shown: a folder
// of the inbox (match: its name; the inbox without one is "unassigned"),
// a saved view (view: the inbox showing exactly its parameters), or a page.
const same = (a: URLSearchParams, b: URLSearchParams) => [...a.keys(), ...b.keys()].every(k => a.get(k) === b.get(k));
export function NavLink({ href, match, view = false, children }: { href: string; match?: string; view?: boolean; children: ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  const current = view
    ? path === "/chest" && same(params, new URLSearchParams(href.split("?")[1] ?? ""))
    : match
    ? path === "/chest" && !params.get("q") && !params.get("tag") && !params.get("priority") && (params.get("folder") ?? "unassigned") === match
    : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
