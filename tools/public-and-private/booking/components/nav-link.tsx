"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A link of the bar that says when it is the page shown (Bookings: the
// list and a booking's page).
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = href === "/chest" ? path === "/chest" || path.startsWith("/chest/bookings") : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={current ? "page" : undefined}>{children}</Link>;
}
