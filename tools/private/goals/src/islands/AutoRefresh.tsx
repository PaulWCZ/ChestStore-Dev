import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change reads itself again when
// the tab comes back, and every `seconds` while its reader was active in
// the last ten minutes — less often while nothing changes, never while
// idle (the Chest may put the tool to sleep). A read that finds the page's
// version unchanged is a 304 (src/app.tsx, version): nothing rendered.
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
