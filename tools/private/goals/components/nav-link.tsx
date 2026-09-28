"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the header that says when it is the page shown (also for the
// pages that belong to it: an objective is part of "Company").
export function NavLink({ href, exact = false, also = [], children }: { href: string; exact?: boolean; also?: string[]; children: ReactNode }) {
  const path = usePathname();
  const under = (base: string) => path === base || path.startsWith(base + "/");
  const current = exact ? path === href : under(href) || also.some(under);
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
