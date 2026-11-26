import { useLive } from "@argentic/chest-app/client";

// A page others change, kept up to date by the Chest (realtime, SDK 0.5+;
// chest.json's "realtime"): the page is read again when a row it shows is
// written — a card moved, a step ticked, a comment added — never on a
// timer, so the tool sleeps while the tab stays open. Each entry follows
// one channel ("board:12", "mine:mbr_…") and the feeds it listens to
// (a table's inserts, updates and deletes); the events carry ids only, and
// the page's own read decides what the member may see. ticket: the mark of
// the member's row in board_live (lib/live.ts), which lets them join; when
// it went (the board's people or the member's groups changed) the Chest
// took them out and the page read itself again: still allowed, a new mark,
// and the channel is joined again.
export type Follow = { channel: string; names: string[]; ticket: string };

function Follows({ channel, names }: Omit<Follow, "ticket">) {
  useLive(channel, names);
  return null;
}

export function Live({ follow }: { follow: Follow[] }) {
  return <>{follow.map(f => <Follows key={`${f.channel} ${f.ticket}`} channel={f.channel} names={f.names} />)}</>;
}
