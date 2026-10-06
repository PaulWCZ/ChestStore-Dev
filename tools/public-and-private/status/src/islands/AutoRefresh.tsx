import { refresh } from "@argentic/chest-app/client";
import { useAutoRefresh } from "@argentic/chest-ui/components";

// The Chest has no WebSocket: a page others change re-reads itself every
// few seconds while it is visible, and at once when it becomes visible
// again (the kit's useAutoRefresh; refresh() keeps what is typed, the
// focus and each island's state).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
