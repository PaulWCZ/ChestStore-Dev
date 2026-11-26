import { useLive } from "@argentic/chest-app/client";

// A page others change, left open, follows the Chest's realtime (never a
// timer): "My expenses" joins the member's own channel (`mine:<id>`, where
// the tool publishes "expenses.changed" when an approver, an accountant or
// a card statement changed their expenses), "To approve" its reader's desk
// (`desk:<approver>` or `desk:accountants`, lib/live.ts), where a row of
// desk_events arrives (its id only) at each write of an expense sent to
// that desk — never a draft's. Only who has the desk joins it; ticket is
// the mark of their row: when it went (their role changed) the Chest took
// them out and the page read itself again — still allowed, a new mark,
// and the channel is joined again.
// At each event the package reads the page again — a 304 when its version
// (src/lib/stamp.ts) did not move — keeping what is typed and the islands'
// state; the Chest holds the connection, so the tool sleeps meanwhile.
function Follow({ channel, names }: { channel: string; names: string[] }) {
  useLive(channel, names);
  return null;
}

export function Live({ channel, names, ticket = "" }: { channel: string; names: string[]; ticket?: string }) {
  return <Follow key={`${channel} ${ticket}`} channel={channel} names={names} />;
}
