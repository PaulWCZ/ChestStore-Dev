"use client";

import { useAutoRefresh } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";

// The Chest has no WebSocket: a page others change (new answers) reads
// itself again every few seconds while it is seen (the kit's rule).
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), seconds);
  return null;
}
