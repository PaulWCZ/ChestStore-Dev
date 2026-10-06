import { useAutoRefresh } from "@argentic/chest-app/client";
import { Menu, SearchBox, type MenuItem } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
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

// The Chest has no WebSocket: a page others change reads itself again —
// the package's useAutoRefresh: when the reader comes back to it, and on
// a timer only while they were active lately (backing off when nothing
// changed, stopping when idle, so a tab left open lets the Chest put the
// tool to sleep).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
