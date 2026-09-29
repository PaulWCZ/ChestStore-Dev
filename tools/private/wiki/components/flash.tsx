"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useEffect, useRef } from "react";

// A message carried to the next page (after a save, a restore…): shown once
// as one of the kit's toasts, then taken out of the address so a reload
// does not repeat it.
export function Flash({ text }: { text: string | null }) {
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (!text || shown.current) return;
    shown.current = true;
    toast({ id: "flash", text });
    const url = new URL(window.location.href);
    for (const key of ["saved", "over", "dropped", "restored", "example"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [text, toast]);
  return null;
}
