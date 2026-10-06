import { refresh } from "@argentic/chest-app/client";
import { useAutoRefresh } from "@argentic/chest-ui/components";

// The Chest has no WebSocket: a page others change reads itself again every
// minute while it is visible, and at once when it becomes visible again
// (the kit's useAutoRefresh; refresh() changes only what changed: what is
// typed, an open form, the scroll stay).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
