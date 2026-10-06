"use client";

import { useAutoRefresh } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";

// The Chest has no WebSocket: a page others change re-reads itself every
// few seconds while it is visible, and at once when it becomes visible
// again (the kit's useAutoRefresh; Next.js's router refreshes).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), seconds);
  return null;
}
