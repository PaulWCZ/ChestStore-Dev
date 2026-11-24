import { toast, useLive } from "@argentic/chest-app/client";
import { SearchBox } from "@argentic/chest-ui/components";
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

// A page others change, read again when the Chest says it changed —
// never on a timer (SDK 0.7.0's realtime: the "page:<id>" channel and its
// feeds in chest.json): a new version, title or flag (pages), a comment
// (page_comments), someone starting or stopping to edit it (page.lock,
// published by the wiki: lib/live.ts). The wiki sleeps while the page
// stays open. The page's version (src/app.tsx: pageStamp) makes a read
// with nothing new a 304. focus: the reader has it on screen — the
// people watching it are not notified of a comment they see arrive.
export function LivePage({ id }: { id: string }) {
  useLive(`page:${id}`, ["pages", "page_comments", "page.lock"], { focus: true });
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
