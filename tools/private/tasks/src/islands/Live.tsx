import { useLive } from "@argentic/chest-app/client";

// A page others change, kept up to date by the Chest (realtime, SDK 0.5+;
// chest.json's "realtime"): the page is read again when a row it shows is
// written — a card moved, a step ticked, a comment added — never on a
// timer, so the tool sleeps while the tab stays open. Each entry follows
// one channel ("board:12", "mine:mbr_…") and the feeds it listens to
// (a table's inserts, updates and deletes); the events carry ids only, and
// the page's own read decides what the member may see.
export type Follow = { channel: string; names: string[] };

function Follows({ channel, names }: Follow) {
  useLive(channel, names);
  return null;
}

export function Live({ follow }: { follow: Follow[] }) {
  return <>{follow.map(f => <Follows key={f.channel} channel={f.channel} names={f.names} />)}</>;
}
