"use client";

import type { LinkProps } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import { beforeLeaving } from "../lib/leave-guard.ts";

// The link the kit's tabs and the tool's own links use inside a form
// (`link={GuardedLink}`): before it leaves, a page with changes not saved
// yet saves them (lib/leave-guard.ts) — the builder and the settings save
// by themselves, and switching tab never throws an edit away. The link of
// the page shown scrolls into view in a bar too narrow for all of them.
export function GuardedLink({ href, children, ...rest }: LinkProps) {
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const current = rest["aria-current"] !== undefined;
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  const go = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await beforeLeaving()) router.push(href);
  };
  return <Link ref={ref} href={href} {...rest} onClick={e => void go(e)}>{children}</Link>;
}
