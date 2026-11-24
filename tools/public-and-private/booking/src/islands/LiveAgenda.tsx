import { useLive } from "@argentic/chest-app/client";

// The agenda left open follows the Chest's realtime (SDK 0.7.0), never a
// timer: each host's bookings and blocked times are a feed on
// "agenda:<host>" (chest.json "realtime"; rows carry their id only — the
// page's read decides what the reader sees). At each change the page is
// read again (useLive: what is typed and the islands' state stay); the
// tool sleeps while the page stays open. An administrator's "Everyone"
// view follows every host it lists. Only who may see an agenda joins its
// channel (the table agenda_live, lib/live.ts): ticket is the mark of the
// reader's row; when it went (their role changed) the Chest took them out
// and the page read itself again — still allowed, a new mark, and the
// channel is joined again.
function Follow({ channel }: { channel: string }) {
  useLive(channel, ["bookings", "blocks"], { focus: true });
  return null;
}

export function LiveAgenda({ hosts }: { hosts: { id: string; ticket: string }[] }) {
  return (
    <>
      {hosts.map(h => (
        <Follow key={`${h.id} ${h.ticket}`} channel={`agenda:${h.id}`} />
      ))}
    </>
  );
}
