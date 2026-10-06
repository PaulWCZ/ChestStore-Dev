import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change is read again when its
// tab comes back, and every few seconds while its reader was active in the
// last ten minutes (the package's useAutoRefresh: it backs off while
// nothing changes and stops when the reader is idle, so the Chest may put
// the tool to sleep). A read that finds the page's version unchanged is a
// 304: nothing rendered (src/lib/stamp.ts).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  useAutoRefresh(seconds);
  return null;
}
