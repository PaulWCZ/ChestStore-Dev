"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the header that says when it is the page shown.
export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const path = usePathname();
  const current = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link prefetch={false} href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
