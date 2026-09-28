"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the header that says when it is the page shown.
export function NavLink({ href, exact = false, also, children }: { href: string; exact?: boolean; also?: string; children: ReactNode }) {
  const path = usePathname();
  const matches = (h: string) => (exact ? path === h : path === h || path.startsWith(h + "/"));
  const current = matches(href) || (also !== undefined && (path === also || path.startsWith(also + "/")));
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
