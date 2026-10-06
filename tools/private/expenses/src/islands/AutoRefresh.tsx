import { refresh } from "@argentic/chest-app/client";
import { useAutoRefresh } from "@argentic/chest-ui/components";

// The Chest has no WebSocket: a page others change (My expenses, To
// approve) reads itself again every few seconds while it is visible, and at
// once when it becomes visible again (the kit's useAutoRefresh; refresh()
// changes only what changed, and keeps what is being typed).
export function AutoRefresh({ seconds }: { seconds: number }) {
  useAutoRefresh(() => void refresh(), seconds);
  return null;
}
