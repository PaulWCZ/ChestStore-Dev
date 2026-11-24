import { useLive } from "@argentic/chest-app/client";

// The team's pages follow what others write, through the Chest's realtime
// (SDK 0.7.0; chest.json's "realtime"): the Chest holds the connection and
// tells each committed row of the feeds — an incident posted or updated, a
// service renamed, a check going down or up, a heartbeat — so the tool
// sleeps while a page stays open, and the page is read again (refresh():
// what is typed, the scroll and the islands' state stay) only when
// something changed: a burst once, a tab in the background once when it
// comes back, again after a reconnection that missed too much. No timer.
// The maintenance posts at a window's edges are rows the "updates"
// schedule writes, so they arrive the same way. The feeds carry ids only:
// the page reads the rest from the tool, which checks who reads.
const events = ["incidents", "updates", "components", "check_states", "heartbeats"];

export function LiveTeam() {
  useLive("team", events);
  return null;
}
