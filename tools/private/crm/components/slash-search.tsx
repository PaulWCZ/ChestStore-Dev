"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// "/" anywhere (but in a field) goes to search: the header's box on a wide
// screen, the search page on a phone.
export function SlashSearch() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const box = document.getElementById("q") as HTMLInputElement | null;
      e.preventDefault();
      if (box && box.offsetParent !== null) {
        box.focus();
        box.select();
      } else router.push("/chest/search");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
