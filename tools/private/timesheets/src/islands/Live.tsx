import { useLive } from "@argentic/chest-app/client";

// A page left open follows the Chest's realtime, never a timer: every page
// joins its member's channel `mine:<id>`, where the tool publishes
// "time.changed" (src/lib/live.ts: a timer started on another device, a
// week approved or sent back), and a manager's pages also join `team`, the
// feeds of `entries` and `weeks` (chest.json "realtime"). At each event the
// package reads the page again — a 304 when its version (src/app.tsx) did
// not move — keeping what is typed and the islands' state; the Chest holds
// the connection, so the tool sleeps while the tab stays open.
export function Live({ channel, names }: { channel: string; names: string[] }) {
  useLive(channel, names);
  return null;
}
