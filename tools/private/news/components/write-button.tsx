"use client";

import { usePathname } from "next/navigation";
import { Pen } from "./icons.tsx";

// "Write a post" in the top bar — not inside the composer, where the only
// button that sends is the composer's own.
export function WriteButton({ label }: { label: string }) {
  const path = usePathname();
  if (path === "/chest/new" || /^\/chest\/posts\/[^/]+\/edit$/u.test(path)) return null;
  return <a className="button small write" href="/chest/new"><Pen /><span>{label}</span></a>;
}
