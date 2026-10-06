import { refresh } from "@argentic/chest-app/client";
import { Menu, SearchBox, type MenuItem } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import { useEffect } from "react";
import { Download, Gear, Upload } from "../components/icons.tsx";

// At the right of the header: the client search ("/" focuses it from
// anywhere but a field) and, for whoever may, a "More" menu of rare acts
// (import, settings, export everything).
export function HeaderTools({ search, more, words }: { search: SearchWords; more: { import: boolean; settings: boolean; exportAll: boolean }; words: { more: string; import: string; settings: string; exportAll: string } }) {
  const items: MenuItem[] = [
    ...(more.import ? [{ label: words.import, href: "/chest/import", icon: <Upload /> }] : []),
    ...(more.settings ? [{ label: words.settings, href: "/chest/settings", icon: <Gear /> }] : []),
    ...(more.exportAll ? [{ label: words.exportAll, href: "/chest/export/all", icon: <Download />, download: true }] : []),
  ];
  return (
    <>
      <SearchBox action="/chest/search" labels={search} maxLength={100} />
      {items.length > 0 && <Menu label={words.more} items={items} showLabel />}
    </>
  );
}

// The search page's own box, big, its words kept (the header's keeps "/").
export function SearchField({ q, labels }: { q: string; labels: SearchWords }) {
  return <SearchBox id="search-q" action="/chest/search" value={q} shortcut={false} autoFocus={!q} maxLength={100} labels={labels} />;
}

// The Chest has no WebSocket: a page others change reads itself again
// (refresh(): only what changed) every few seconds — only while it is seen
// and its reader was active in the last five minutes, so a tab left open
// overnight never keeps the tool awake (a Chest puts an idle tool to
// sleep) — and at once when the reader comes back to it.
const idle = 5 * 60_000;
export function AutoRefresh({ seconds }: { seconds: number }) {
  useEffect(() => {
    let last = Date.now();
    const active = () => { last = Date.now(); };
    const tick = () => { if (document.visibilityState === "visible" && Date.now() - last < idle) void refresh(); };
    let away = false;
    const leave = () => { if (document.visibilityState === "hidden") away = true; };
    const back = () => {
      if (document.visibilityState !== "visible" || !away) return;
      away = false;
      last = Date.now();
      void refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    const options = { passive: true, capture: true } as const;
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"] as const) addEventListener(name, active, options);
    document.addEventListener("visibilitychange", leave);
    document.addEventListener("visibilitychange", back);
    addEventListener("focus", back);
    const blur = () => { away = true; };
    addEventListener("blur", blur);
    return () => {
      clearInterval(timer);
      for (const name of ["pointerdown", "keydown", "wheel", "touchstart"] as const) removeEventListener(name, active, options);
      document.removeEventListener("visibilitychange", leave);
      document.removeEventListener("visibilitychange", back);
      removeEventListener("focus", back);
      removeEventListener("blur", blur);
    };
  }, [seconds]);
  return null;
}
