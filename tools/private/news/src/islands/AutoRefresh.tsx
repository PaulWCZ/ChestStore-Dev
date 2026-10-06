import { useAutoRefresh } from "@argentic/chest-ui/components";
import { refresh } from "@argentic/chest-app/client";

// The Chest has no WebSocket: a page others change re-reads itself every
// few seconds while it is visible, and at once when it becomes visible
// again (the kit's useAutoRefresh; refresh() keeps what is typed, the
// focus and each island's state).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
