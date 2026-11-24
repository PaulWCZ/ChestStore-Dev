import { useLive } from "@argentic/chest-app/client";
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

// A page others change, left open, follows them (SDK 0.7.0 realtime, never
// a timer): the Chest tells the page each row written to the tables it
// shows (chest.json "realtime": the "team" channel, every member who has
// Clients; its feeds carry the rows' keys only), and the page is read
// again from the server, which decides what its reader may see (a booking
// told for some people only). The tool sleeps meanwhile; a read with
// nothing new is a 304.
export function Live({ tables }: { tables: string[] }) {
  useLive("team", tables);
  return null;
}
