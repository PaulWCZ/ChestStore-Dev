import { useAutoRefresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page is read again when the person comes
// back to it — the tab shown again, the window focused — and every
// `seconds` while they were active in the last ten minutes, so a timer
// started on another device, a week approved meanwhile, show up. Idle, it
// stops: a tab left open all day lets the tool sleep (the package's
// useAutoRefresh). Each page's version (src/app.tsx) makes a read with
// nothing new a 304: the Reports' and Team's queries are not run again.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  useAutoRefresh(seconds);
  return null;
}
