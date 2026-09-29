"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { More } from "./icons.tsx";

export type BarLink = { href: string; label: string; icon: ReactNode; exact?: boolean; count?: { value: number; label: string } };

// The phone's navigation, at the thumb: the three places of every day, and
// the others one tap further in "More" — each with its words, none hidden
// off the side of the screen.
export function BottomBar({ label, main, more, moreLabel }: { label: string; main: BarLink[]; more: BarLink[]; moreLabel: string }) {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const on = (l: BarLink) => (l.exact ? path === l.href : path === l.href || path.startsWith(l.href + "/"));
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  const inMore = more.some(on);
  return (
    <nav className="bottom-bar" aria-label={label}>
      {main.map(l => (
        <Link key={l.href} href={l.href} aria-current={on(l) ? "page" : undefined}>
          {l.icon}
          <span>{l.label}</span>
          {l.count && l.count.value > 0 && <span className="count" aria-label={l.count.label}>{l.count.value}</span>}
        </Link>
      ))}
      <details ref={menu} className="bar-more">
        <summary aria-current={inMore ? "page" : undefined}><More /><span>{moreLabel}</span></summary>
        <div className="bar-menu">
          {more.map(l => <Link key={l.href} href={l.href} aria-current={on(l) ? "page" : undefined}>{l.icon}<span>{l.label}</span></Link>)}
        </div>
      </details>
    </nav>
  );
}
