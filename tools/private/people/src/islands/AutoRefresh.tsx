import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change is read again when it
// comes back into view, and every few seconds while its reader was active
// in the last ten minutes — idle, it stops, so a tab left open lets the
// tool sleep (the package's useAutoRefresh; refresh() changes only what
// changed, and keeps what is typed).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
