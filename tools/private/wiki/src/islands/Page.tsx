import { refresh, toast } from "@argentic/chest-app/client";
import { SearchBox, useAutoRefresh } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useRef } from "react";

// What every page may carry: the header's search, the marker that the page
// runs, the re-reading of a page others change, a message carried over
// from the page before.

// The header's search box (the kit's: a form to /chest/search that works
// without script; "/" focuses it once the page runs).
export function Search({ labels, placeholder }: { labels: SearchWords; placeholder: string }) {
  return <SearchBox action="/chest/search" labels={labels} placeholder={placeholder} maxLength={100} />;
}

// The page runs in the browser: its buttons answer (the browser flows wait
// for this marker on <html> rather than for a time). Every layout has it.
export function Ready() {
  useEffect(() => {
    document.documentElement.dataset["hydrated"] = "";
  }, []);
  return null;
}

// The Chest has no WebSocket: a page others change re-reads itself every
// few seconds while it is visible, and at once when it becomes visible
// again (the kit's useAutoRefresh; refresh() keeps what is typed, the
// focus and each island's state).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}

// A message carried to the next page (after a save, a restore…): shown once
// as one of the kit's toasts, then taken out of the address so a reload
// does not repeat it.
export function Flash({ text }: { text: string | null }) {
  // An island kept by a refresh gets new props: a new message is shown,
  // the same one again only after a page without one.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!text) {
      shown.current = null;
      return;
    }
    if (shown.current === text) return;
    shown.current = text;
    toast({ id: "flash", text });
    const url = new URL(window.location.href);
    for (const key of ["saved", "over", "dropped", "restored", "example"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [text]);
  return null;
}
