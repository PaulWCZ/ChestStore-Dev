"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { beforeLeaving } from "../lib/leave-guard.ts";

// A link of a bar that says when its page is shown. `exact`: only that
// page (a form's Questions tab), otherwise that page or one below it;
// `also`: other pages it stands for (Answers also for the Summary). Before
// it leaves, a page with changes not saved yet saves them
// (lib/leave-guard.ts); the link of the page shown scrolls into view in a
// bar too narrow for all of them.
export function NavLink({ href, children, exact = false, also = [], className }: { href: string; children: ReactNode; exact?: boolean; also?: string[]; className?: string }) {
  const path = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const matches = (h: string) => path === h || path.startsWith(h + "/");
  const current = exact ? path === href : matches(href) || also.some(matches);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  const go = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await beforeLeaving()) router.push(href);
  };
  return <Link ref={ref} href={href} className={className} aria-current={current ? "page" : undefined} onClick={e => void go(e)}>{children}</Link>;
}
