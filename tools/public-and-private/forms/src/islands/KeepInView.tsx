import { useEffect } from "react";

// The shown tab of a bar too narrow for all of them (a phone): scrolled
// into view, so the reader sees where they are.
export function KeepInView({ selector, current }: { selector: string; current: string }) {
  useEffect(() => {
    document.querySelector(selector)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selector, current]);
  return null;
}
