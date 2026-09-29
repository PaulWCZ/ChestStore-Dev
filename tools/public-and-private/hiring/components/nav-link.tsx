"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the top bar that says when its page (or one below it) is shown.
// "/chest" is current on the jobs and their candidates.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = href === "/chest" ? path === "/chest" || path.startsWith("/chest/jobs") || path.startsWith("/chest/candidates") || path.startsWith("/chest/mail") : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
