import { useLive } from "@argentic/chest-app/client";

// A page others change, left open (the company's goals, a team's, an
// objective, my goals), follows the Chest's realtime, never a timer: it
// joins the channel `goals`, where every write of the tables objectives,
// key_results, check_ins and comments arrives — their id only (chest.json
// "realtime" feeds); the page reads the rest itself, as its reader may
// (a confidential objective stays its readers'). At each event the package
// reads the page again — a 304 when its version (src/lib/stamp.ts) did not
// move —, keeping what is typed and the islands' state; the Chest holds the
// connection, so the tool sleeps while the tab stays open.
export function Live({ channel, names }: { channel: string; names: string[] }) {
  useLive(channel, names);
  return null;
}
