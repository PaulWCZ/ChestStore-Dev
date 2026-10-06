import { call, refresh, toast } from "@argentic/chest-app/client";
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

// The Chest has no WebSocket: a page others change asks every minute,
// while it is visible and its reader was active in the last ten minutes,
// whether what it shows changed (its stamp: src/lib/pages.ts) — a few bytes
// — and re-reads itself only then (refresh() keeps what is typed, the
// focus and each island's state). A tab left open does not keep the tool
// awake: idle, it stops asking; seen again, it asks once at once.
const idleAfter = 10 * 60_000;
export function AutoRefresh({ seconds, pageId, stamp }: { seconds: number; pageId: string; stamp: string }) {
  const latest = useRef(stamp);
  latest.current = stamp;
  useEffect(() => {
    let active = Date.now();
    const touched = () => { active = Date.now(); };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await call("pageStamp", { pageId }, { refresh: false, quiet: true, parallel: true });
      if (r.ok && r.value !== latest.current) await refresh();
    };
    const timer = setInterval(() => { if (Date.now() - active < idleAfter) void check(); }, seconds * 1000);
    const seen = () => { if (document.visibilityState === "visible") { touched(); void check(); } };
    for (const e of ["pointerdown", "keydown", "scroll"]) window.addEventListener(e, touched, { passive: true });
    document.addEventListener("visibilitychange", seen);
    return () => {
      clearInterval(timer);
      for (const e of ["pointerdown", "keydown", "scroll"]) window.removeEventListener(e, touched);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [pageId, seconds]);
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
