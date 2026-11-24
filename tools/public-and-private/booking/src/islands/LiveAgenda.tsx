import { useLive } from "@argentic/chest-app/client";

// The agenda left open follows the Chest's realtime (SDK 0.7.0), never a
// timer: each host's bookings and blocked times are a feed on
// "agenda:<host>" (chest.json "realtime"; rows carry their id only — the
// page's read decides what the reader sees). At each change the page is
// read again (useLive: what is typed and the islands' state stay); the
// tool sleeps while the page stays open. An administrator's "Everyone"
// view follows every host it lists.
function Follow({ channel }: { channel: string }) {
  useLive(channel, ["bookings", "blocks"], { focus: true });
  return null;
}

export function LiveAgenda({ hosts }: { hosts: string[] }) {
  return (
    <>
      {hosts.map(id => (
        <Follow key={id} channel={`agenda:${id}`} />
      ))}
    </>
  );
}
