import { useLive } from "@argentic/chest-app/client";

// The team's pages follow what others write, through the Chest's realtime
// (SDK 0.7.0; chest.json's "realtime"): the Chest holds the connection and
// tells each committed row of the feeds, so the tool sleeps while a page
// stays open and the page is read again (refresh(): what is typed, the
// scroll and the islands' state stay) only when something changed — a
// burst read once, a tab in the background once when it comes back, again
// after a reconnection that missed too much (resync). No timer.
//
// desk: the roles that read tickets (the inbox, a ticket, the reports,
// settings' tags) — the rows' ids only, the page reads the rest; mine: the
// member's own requests ("mine:<their id>", which only they may join),
// told by the tool when the team answers one or changes its status.
const deskEvents = ["tickets", "messages", "ticket_tags", "tags", "incidents"];
const mineEvents = ["request.changed"];

function Follow({ channel, events }: { channel: string; events: string[] }) {
  useLive(channel, events);
  return null;
}

export function LivePage({ desk, mine }: { desk: boolean; mine: string }) {
  return (
    <>
      {desk && <Follow channel="desk" events={deskEvents} />}
      <Follow channel={mine} events={mineEvents} />
    </>
  );
}
