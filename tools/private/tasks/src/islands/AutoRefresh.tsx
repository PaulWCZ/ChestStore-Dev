import { useAutoRefresh } from "@argentic/chest-ui/components";
import { refresh } from "../core/client.tsx";

// The Chest has no WebSocket: a page others change reads itself again every
// few seconds while it is visible, and at once when it becomes visible
// again (the kit's useAutoRefresh; refresh() changes only what changed).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
