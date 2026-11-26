import { useLive } from "@argentic/chest-app/client";

// A page others change (the directory, the checklists, my to-do, HR's
// records), kept up to date by the Chest — realtime, SDK 0.5+, chest.json's
// "realtime" —: the page is read again when a row it shows is written,
// never on a timer, so the tool sleeps while the tab stays open. Two
// channels: "people" (every member: checklists, profiles, who is away) and
// "hr" (the role hr only: records, change requests, arrivals). The events
// carry ids only; the page's own read decides what this member may see.
export type Follow = { channel: "people" | "hr"; names: string[] };

function Follows({ channel, names }: Follow) {
  useLive(channel, names);
  return null;
}

export function Live({ follow }: { follow: Follow[] }) {
  return <>{follow.map(f => <Follows key={f.channel} channel={f.channel} names={f.names} />)}</>;
}
