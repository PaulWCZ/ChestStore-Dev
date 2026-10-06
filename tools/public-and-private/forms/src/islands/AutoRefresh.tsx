import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change (new answers, a form
// shared) is read again when the person comes back to it, and every
// `seconds` while they were active in the last ten minutes — never all
// day: an idle tool may sleep. The page's version (src/app.tsx) makes a
// read with nothing new cost almost nothing.
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
