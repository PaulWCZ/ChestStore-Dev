"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the header that says when it is the page shown (or one of the
// pages it leads to: `also`).
export function NavLink({ href, exact = false, also = [], children }: { href: string; exact?: boolean; also?: string[]; children: ReactNode }) {
  const path = usePathname();
  const current = (exact ? path === href : path === href || path.startsWith(href + "/")) || also.some(a => path === a || path.startsWith(a + "/"));
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
