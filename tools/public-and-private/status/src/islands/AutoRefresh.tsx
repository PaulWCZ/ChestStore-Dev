import { useAutoRefresh } from "@argentic/chest-app/client";

// The public status page only (the team's pages are live: LiveTeam). SDK
// 0.7.0's realtime joins a page with the member's session, on the team
// host: a visitor of the public part has none. So the public page is read
// again when it comes back into view, and every minute while its reader
// was active in the last ten minutes — idle, it stops, so a tab left open
// lets the tool sleep (the package's useAutoRefresh; refresh() changes
// only what changed).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  useAutoRefresh(seconds);
  return null;
}
