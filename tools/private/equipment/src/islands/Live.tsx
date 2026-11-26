import { useLive } from "@argentic/chest-app/client";

// A page others change, left open, follows them (SDK 0.7.0 realtime, never
// a timer): the Chest tells the page each row written to the tables it
// shows (chest.json "realtime" feeds: the rows' keys only, never what they
// hold), and the page is read again from the server, which decides what
// its reader may see. The tool sleeps meanwhile. "managers": the feeds of
// what managers act on (items, requests, problems, an inventory under way);
// "mine:<id>": a member's own page, told "mine.changed" by the server when
// what they hold changes (lib/tell.ts refreshBadges: 0.7.0 feeds no
// {member} channel, and a table feeds one channel only).
export function Live({ channel, tables }: { channel: string; tables: string[] }) {
  useLive(channel, tables);
  return null;
}
