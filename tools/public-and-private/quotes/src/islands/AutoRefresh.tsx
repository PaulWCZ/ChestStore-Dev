import { useAutoRefresh } from "@argentic/chest-app/client";

// The desk and the lists read again by themselves: when the tab comes back
// or the window gets the focus, and every minute while their reader was
// active in the last ten (the package's useAutoRefresh: it backs off while
// nothing changes and stops when the reader is idle, so the Chest can put
// the tool to sleep). A quote accepted online, a payment recorded by
// someone else, shows without a reload; a read with nothing new is a 304
// (src/app.tsx, the pages' version). Nothing to see.
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(seconds);
  return null;
}
