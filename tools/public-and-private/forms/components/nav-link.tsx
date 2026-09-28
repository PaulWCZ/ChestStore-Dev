"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of a bar that says when its page is shown. `exact`: only that
// page (a form's Questions tab), otherwise that page or one below it.
export function NavLink({ href, children, exact = false, className }: { href: string; children: ReactNode; exact?: boolean; className?: string }) {
  const path = usePathname();
  const current = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link href={href} className={className} aria-current={current ? "page" : undefined}>{children}</Link>;
}
