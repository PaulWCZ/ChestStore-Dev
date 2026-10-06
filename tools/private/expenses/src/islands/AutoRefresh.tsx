import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change (My expenses, To
// approve) is read again when it comes back into view, and every few
// seconds while its reader was active in the last ten minutes — idle, it
// stops, so a tab left open lets the tool sleep (the package's
// useAutoRefresh). The page's version (src/app.tsx) makes a read with
// nothing new a 304.
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
