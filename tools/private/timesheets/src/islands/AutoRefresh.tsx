import { refresh } from "@argentic/chest-app/client";
import { useAutoRefresh } from "@argentic/chest-ui/components";

// The Chest has no WebSocket: a page re-reads itself every minute while it
// is visible, and at once when it becomes visible again (the timer started
// on another device; the kit's useAutoRefresh). refresh() changes only
// what changed: what is typed, the focus and the scroll stay.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
