import { useLive } from "@argentic/chest-app/client";

// A page others change (the team calendar, my requests and balances, the
// requests waiting for me), kept up to date by the Chest — realtime, SDK
// 0.5+, chest.json's "realtime" —: the page is read again when a request
// or a balance line is written, never on a timer, so the tool sleeps while
// the tab stays open. The events carry ids only; the page's own read
// decides what this member may see.
export function Live() {
  useLive("leave", ["requests", "ledger", "leave_types"]);
  return null;
}
