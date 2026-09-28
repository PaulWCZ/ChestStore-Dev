"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the header that says when it is the page shown (or one of the
// pages it leads to: `also`). An icon-only link carries its words in
// `label` (its accessible name and tooltip).
export function NavLink({ href, exact = false, also = [], className, label, children }: { href: string; exact?: boolean; also?: string[]; className?: string; label?: string; children: ReactNode }) {
  const path = usePathname();
  const current = (exact ? path === href : path === href || path.startsWith(href + "/")) || also.some(a => path === a || path.startsWith(a + "/"));
  return (
    <Link href={href} className={className} aria-current={current ? "page" : undefined} aria-label={label} title={label}>
      {children}
    </Link>
  );
}
