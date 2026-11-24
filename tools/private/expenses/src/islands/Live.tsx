import { useLive } from "@argentic/chest-app/client";

// A page others change, left open, follows the Chest's realtime (never a
// timer): "My expenses" joins the member's own channel (`mine:<id>`, where
// the tool publishes "expenses.changed" when an approver, an accountant or
// a card statement changed their expenses), "To approve" the channel
// `desk`, where every write of the table `expenses` arrives (its id only).
// At each event the package reads the page again — a 304 when its version
// (src/lib/stamp.ts) did not move — keeping what is typed and the islands'
// state; the Chest holds the connection, so the tool sleeps meanwhile.
export function Live({ channel, names }: { channel: string; names: string[] }) {
  useLive(channel, names);
  return null;
}
